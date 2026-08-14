<template>
  <v-container class="fill-height">
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="4">
        <v-card>
          <v-card-title class="text-h5">Reset Password</v-card-title>
          <v-card-text>
            <!-- Loading state while validating token -->
            <template v-if="validating">
              <div class="d-flex justify-center py-8">
                <v-progress-circular indeterminate color="primary" />
              </div>
              <p class="text-center text-body-2">Validating reset link...</p>
            </template>

            <!-- Success state -->
            <template v-else-if="success">
              <v-alert type="success" class="mb-4">
                Your password has been reset successfully!
              </v-alert>
              <v-alert v-if="logoutFailed" type="warning" class="mb-4">
                We couldn't reach the server to clear your old session. Your new password is in
                effect, but this browser may still show you as signed in until you reload.
              </v-alert>
              <v-btn color="primary" block to="/login"> Go to Login </v-btn>
            </template>

            <!-- Error state (invalid/expired token) -->
            <template v-else-if="tokenError">
              <v-alert type="error" class="mb-4">
                {{ tokenError }}
              </v-alert>
              <v-btn color="primary" block to="/login"> Go to Login </v-btn>
            </template>

            <!-- Reset form -->
            <template v-else>
              <v-alert
                v-if="errorMessage"
                type="error"
                class="mb-4"
                closable
                @click:close="errorMessage = ''"
              >
                {{ errorMessage }}
              </v-alert>

              <p class="text-body-2 mb-4">
                <template v-if="username">
                  Enter a new password for <strong>{{ username }}</strong
                  >.
                </template>
                <template v-else> Enter your new password below. </template>
              </p>

              <v-form @submit.prevent="handleReset">
                <v-text-field
                  v-model="newPassword"
                  label="New Password"
                  :type="showPassword ? 'text' : 'password'"
                  required
                  prepend-icon="mdi-lock"
                  :append-inner-icon="showPassword ? 'mdi-eye' : 'mdi-eye-off'"
                  :disabled="loading"
                  :rules="passwordRules"
                  @click:append-inner="showPassword = !showPassword"
                />
                <v-text-field
                  v-model="confirmPassword"
                  label="Confirm Password"
                  :type="showPassword ? 'text' : 'password'"
                  required
                  prepend-icon="mdi-lock-check"
                  :disabled="loading"
                  :rules="confirmPasswordRules"
                />
                <v-btn
                  type="submit"
                  color="primary"
                  block
                  class="mt-4"
                  :loading="loading"
                  :disabled="!isValid"
                >
                  Reset Password
                </v-btn>
              </v-form>
            </template>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api } from '../services/api'
import { clearCachedUser, markSessionDead } from '../services/session'

const route = useRoute()

const newPassword = ref('')
const confirmPassword = ref('')
const showPassword = ref(false)
const loading = ref(false)
const validating = ref(true)
const success = ref(false)
const errorMessage = ref('')
const logoutFailed = ref(false)
const tokenError = ref('')
const username = ref('')

const token = computed(() => route.query.token as string | undefined)

const passwordRules = [
  (v: string) => !!v || 'Password is required',
  (v: string) => v.length >= 8 || 'Password must be at least 8 characters',
]

const confirmPasswordRules = [
  (v: string) => !!v || 'Please confirm your password',
  (v: string) => v === newPassword.value || 'Passwords do not match',
]

const isValid = computed(() => {
  return newPassword.value.length >= 8 && confirmPassword.value === newPassword.value
})

onMounted(async () => {
  if (!token.value) {
    tokenError.value = 'No reset token provided. Please use the link from your administrator.'
    validating.value = false
    return
  }

  try {
    const result = await api.auth.validateResetToken(token.value)
    if (!result.valid) {
      tokenError.value = 'This reset link is invalid or has already been used.'
    } else {
      username.value = result.username || ''
    }
  } catch (error) {
    console.error('Token validation error:', error)
    tokenError.value = 'Unable to validate reset link. Please try again.'
  } finally {
    validating.value = false
  }
})

const handleReset = async () => {
  if (!token.value || !isValid.value) return

  loading.value = true
  errorMessage.value = ''

  try {
    await api.auth.resetPassword({
      token: token.value,
      newPassword: newPassword.value,
    })
    // The reset bumped tokenVersion, so any existing session is already dead
    // server-side. Revoke the cookie and drop cached state so the guards don't
    // keep reading a stale profile.
    const { revoked } = await api.auth.logout()
    clearCachedUser()
    markSessionDead()
    // A failed revoke leaves a stale cookie in the jar. It authenticates nothing
    // — tokenVersion moved — so this is cosmetic rather than a security problem,
    // but a lingering cookie makes the router guards render a signed-in shell
    // that immediately 401s. Say so instead of showing an unqualified success.
    logoutFailed.value = !revoked
    success.value = true
  } catch (error) {
    console.error('Password reset error:', error)
    if (error instanceof Error) {
      // Check for specific error messages
      if (error.message.includes('expired')) {
        tokenError.value =
          'This reset link has expired. Please request a new one from your administrator.'
      } else if (error.message.includes('Invalid')) {
        tokenError.value = 'This reset link is invalid or has already been used.'
      } else {
        errorMessage.value = error.message
      }
    } else {
      errorMessage.value = 'An error occurred. Please try again.'
    }
  } finally {
    loading.value = false
  }
}
</script>
