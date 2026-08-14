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
                  :loading="loggingOut"
                  :disabled="linking || loggingOut"
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
import { useRoute, useRouter } from 'vue-router'
import { api } from '../services/api'
import { useUserStore } from '../stores/user'
import { clearCachedUser, markSessionDead } from '../services/session'

const route = useRoute()
const router = useRouter()
const userStore = useUserStore()

const validating = ref(true)
const success = ref(false)
const successMessage = ref('')
const errorMessage = ref('')
const tokenError = ref('')
const discordUsername = ref('')
const linking = ref(false)
const loggingOut = ref(false)

const token = computed(() => route.query.token as string | undefined)
const user = computed(() => userStore.getUser())
const isLoggedIn = computed(() => !!user.value)
const currentUsername = computed(() => user.value?.displayName || user.value?.username || '')

// Every route away from this page has to carry the link token back, or the user
// returns to a "No link token provided" dead end.
const returnPath = computed(() => `/link-discord?token=${token.value}`)

const loginRedirectUrl = computed(() => `/login?redirect=${encodeURIComponent(returnPath.value)}`)

const registerRedirectUrl = computed(
  () => `/register?redirect=${encodeURIComponent(returnPath.value)}`
)

/**
 * Sign out so the user can link Discord to a different account.
 *
 * Awaits the round-trip and navigates afterwards rather than letting a `to=`
 * binding race it: the login screen must not appear while the old session is
 * still live, or the user signs in as themselves again and the button looks
 * broken.
 *
 * A failed revoke is surfaced rather than swallowed. Local state is torn down
 * either way — the user must never be stuck in a signed-in-looking UI — but the
 * session stays valid server-side for up to the cookie's lifetime, which the
 * user needs to know before handing the machine to someone else.
 */
const logout = async () => {
  loggingOut.value = true
  try {
    // Revoke server-side: the session cookie is httpOnly, so clearing local
    // state alone would leave the API session alive and the user logged in.
    const { revoked } = await api.auth.logout()
    clearCachedUser()
    markSessionDead()
    userStore.clearUser()

    // The previous `to="/login?redirect=/link-discord"` dropped the token.
    await router.push({
      path: '/login',
      query: {
        redirect: returnPath.value,
        ...(revoked ? {} : { reason: 'logout-failed' }),
      },
    })
  } finally {
    loggingOut.value = false
  }
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
