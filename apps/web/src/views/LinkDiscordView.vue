<template>
  <v-container class="fill-height">
    <v-row align="center" justify="center">
      <v-col cols="12" sm="8" md="4">
        <v-card>
          <v-card-title class="text-h5">Link Discord Account</v-card-title>
          <v-card-text>
            <!-- Loading state while validating token -->
            <template v-if="validating">
              <div class="d-flex justify-center py-8">
                <v-progress-circular indeterminate color="primary" />
              </div>
              <p class="text-center text-body-2">Validating link...</p>
            </template>

            <!-- Success state -->
            <template v-else-if="success">
              <v-alert type="success" class="mb-4">
                {{ successMessage }}
              </v-alert>
              <v-btn color="primary" block to="/market"> Continue to Market </v-btn>
            </template>

            <!-- Error state (invalid/expired token) -->
            <template v-else-if="tokenError">
              <v-alert type="error" class="mb-4">
                {{ tokenError }}
              </v-alert>
              <v-btn color="primary" block to="/login"> Go to Login </v-btn>
            </template>

            <!-- Valid token - show link confirmation -->
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

              <div class="text-center mb-6">
                <v-avatar size="80" color="primary" class="mb-4">
                  <v-icon size="48">mdi-discord</v-icon>
                </v-avatar>
                <p class="text-body-1">
                  Link your Discord account <strong>{{ discordUsername }}</strong> to your Kawakawa
                  account?
                </p>
              </div>

              <template v-if="isLoggedIn">
                <p class="text-body-2 mb-4 text-center">
                  You are logged in as <strong>{{ currentUsername }}</strong
                  >.
                </p>
                <v-btn
                  color="primary"
                  block
                  :loading="linking"
                  :disabled="linking"
                  @click="handleLink"
                >
                  Link Discord Account
                </v-btn>
                <v-btn
                  variant="text"
                  block
                  class="mt-2"
                  to="/login?redirect=/link-discord"
                  @click="logout"
                >
                  Login as Different User
                </v-btn>
              </template>

              <template v-else>
                <p class="text-body-2 mb-4 text-center">
                  Please log in to link your Discord account.
                </p>
                <v-btn color="primary" block :to="loginRedirectUrl"> Log In </v-btn>
                <p class="text-body-2 mt-4 text-center text-medium-emphasis">
                  Don't have an account?
                  <router-link :to="registerRedirectUrl">Register here</router-link>
                </p>
              </template>
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
import { useUserStore } from '../stores/user'
import { clearCredentials } from '../services/session'

const route = useRoute()
const userStore = useUserStore()

const validating = ref(true)
const success = ref(false)
const successMessage = ref('')
const errorMessage = ref('')
const tokenError = ref('')
const discordUsername = ref('')
const linking = ref(false)

const token = computed(() => route.query.token as string | undefined)
const user = computed(() => userStore.getUser())
const isLoggedIn = computed(() => !!user.value)
const currentUsername = computed(() => user.value?.displayName || user.value?.username || '')

// Build login redirect URL that preserves the token
const loginRedirectUrl = computed(() => {
  const redirect = `/link-discord?token=${token.value}`
  return `/login?redirect=${encodeURIComponent(redirect)}`
})

const registerRedirectUrl = computed(() => {
  const redirect = `/link-discord?token=${token.value}`
  return `/register?redirect=${encodeURIComponent(redirect)}`
})

const logout = () => {
  // Must drop the JWT too — clearing only the cached user left the API
  // session alive, so "log out" here didn't actually log the user out.
  clearCredentials()
  userStore.clearUser()
}

onMounted(async () => {
  if (!token.value) {
    tokenError.value = 'No link token provided. Please use the /link command in Discord.'
    validating.value = false
    return
  }

  try {
    const result = await api.auth.validateDiscordLinkToken(token.value)
    if (!result.valid) {
      tokenError.value = result.error || 'This link is invalid or has expired.'
    } else {
      discordUsername.value = result.discordUsername || 'Unknown'
    }
  } catch (error) {
    console.error('Token validation error:', error)
    tokenError.value = 'Unable to validate link. Please try again.'
  } finally {
    validating.value = false
  }
})

const handleLink = async () => {
  if (!token.value) return

  linking.value = true
  errorMessage.value = ''

  try {
    const result = await api.auth.completeDiscordLink({ token: token.value })
    success.value = true
    successMessage.value = result.message
  } catch (error) {
    console.error('Discord link error:', error)
    if (error instanceof Error) {
      if (error.message.includes('expired')) {
        tokenError.value = 'This link has expired. Please run /link again in Discord.'
      } else if (error.message.includes('already linked')) {
        errorMessage.value = error.message
      } else {
        errorMessage.value = error.message || 'An error occurred. Please try again.'
      }
    } else {
      errorMessage.value = 'An error occurred. Please try again.'
    }
  } finally {
    linking.value = false
  }
}
</script>
