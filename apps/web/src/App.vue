<template>
  <v-app>
    <v-app-bar v-if="isAuthenticated" color="primary" density="compact">
      <template #prepend>
        <img src="/navbar-logo.svg" alt="Kawakawa CX" class="navbar-logo ml-3" />
      </template>
      <v-spacer />
      <!-- Only show navigation for verified users -->
      <template v-if="isVerified">
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/market" icon size="small" class="mx-1">
              <v-icon>mdi-store</v-icon>
            </v-btn>
          </template>
          Market
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/inventory" icon size="small" class="mx-1">
              <v-icon>mdi-package-variant</v-icon>
            </v-btn>
          </template>
          My Inventory
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/orders" icon size="small" class="mx-1">
              <v-icon>mdi-clipboard-list</v-icon>
            </v-btn>
          </template>
          My Orders
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/prices" icon size="small" class="mx-1">
              <v-icon>mdi-tag-multiple</v-icon>
            </v-btn>
          </template>
          Price Lists
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/calculator" icon size="small" class="mx-1">
              <v-icon>mdi-calculator</v-icon>
            </v-btn>
          </template>
          Calculator
        </v-tooltip>
        <v-tooltip v-if="canViewPackages" location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/packages" icon size="small" class="mx-1">
              <v-icon>mdi-package-variant-closed</v-icon>
            </v-btn>
          </template>
          Packages
        </v-tooltip>
        <v-tooltip v-if="canViewSalesOrders" location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/sales-orders" icon size="small" class="mx-1">
              <v-badge
                v-if="openSalesOrderCount > 0"
                :content="openSalesOrderCount"
                color="warning"
                offset-x="-2"
                offset-y="-2"
              >
                <v-icon>mdi-clipboard-text-clock</v-icon>
              </v-badge>
              <v-icon v-else>mdi-clipboard-text-clock</v-icon>
            </v-btn>
          </template>
          Sales Order Queue
        </v-tooltip>
        <!-- Logistics — hidden until feature is ready to ship
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/logistics" icon size="small" class="mx-1">
              <v-icon>mdi-rocket-launch</v-icon>
            </v-btn>
          </template>
          Logistics
        </v-tooltip>
        -->
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/my-bases" icon size="small" class="mx-1">
              <v-icon>mdi-factory</v-icon>
            </v-btn>
          </template>
          My Bases
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/corp-overview" icon size="small" class="mx-1">
              <v-icon>mdi-chart-box</v-icon>
            </v-btn>
          </template>
          Corp Overview
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/account" icon size="small" class="mx-1">
              <v-icon>mdi-account-cog</v-icon>
            </v-btn>
          </template>
          Account
        </v-tooltip>
        <NotificationDropdown />
        <v-tooltip v-if="isAdmin" location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/admin" icon size="small" class="mx-1">
              <v-badge
                v-if="pendingApprovalsCount > 0"
                :content="pendingApprovalsCount"
                color="error"
                floating
              >
                <v-icon>mdi-shield-account</v-icon>
              </v-badge>
              <v-icon v-else>mdi-shield-account</v-icon>
            </v-btn>
          </template>
          Admin
        </v-tooltip>
      </template>
      <v-tooltip location="bottom">
        <template #activator="{ props }">
          <v-btn v-bind="props" icon size="small" class="mx-1" @click="logoutDialog = true">
            <v-icon>mdi-logout</v-icon>
          </v-btn>
        </template>
        Logout
      </v-tooltip>
    </v-app-bar>

    <!-- Logout Confirmation Dialog -->
    <v-dialog v-model="logoutDialog" max-width="350">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon start color="warning">mdi-logout</v-icon>
          Logout
        </v-card-title>
        <v-card-text> Are you sure you want to logout? </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="logoutDialog = false">Cancel</v-btn>
          <v-btn color="warning" variant="elevated" @click="confirmLogout">Logout</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-main>
      <!-- App Update Banner -->
      <v-banner
        v-if="showAppUpdateBanner"
        color="info"
        icon="mdi-update"
        lines="one"
        sticky
        class="app-update-banner"
      >
        <template #text>
          A new version of the app is available.
          <a href="#" class="text-info-lighten-3" @click.prevent="refreshApp">Refresh to update</a>
        </template>
        <template #actions>
          <v-btn variant="text" size="small" @click="dismissAppUpdateBanner">Dismiss</v-btn>
        </template>
      </v-banner>

      <router-view />
    </v-main>

    <div class="text-center py-2">
      <a class="text-caption text-medium-emphasis" href="#" @click.prevent="showDebug = true">
        Debug Info
      </a>
    </div>

    <DebugModal v-model="showDebug" />
  </v-app>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { PERMISSIONS } from '@kawakawa/types'
import { useUserStore } from './stores/user'
import { useInvoicesStore } from './stores/invoices'
import { useShoppingListStore } from './stores/shoppingList'
import { commodityService } from './services/commodityService'
import { locationService } from './services/locationService'
import { roleService } from './services/roleService'
import { api } from './services/api'
import { syncService, SYNC_EVENTS } from './services/syncService'
import { onAuthFailure } from './services/authBus'
import {
  getToken,
  clearCredentials,
  rolesDifferFromCachedUser,
  JWT_STORAGE_KEY,
} from './services/session'
import NotificationDropdown from './components/NotificationDropdown.vue'
import DebugModal from './components/DebugModal.vue'

const router = useRouter()
const userStore = useUserStore()
const invoicesStore = useInvoicesStore()
const shoppingListStore = useShoppingListStore()
const isAuthenticated = ref(false)
const pendingApprovalsCount = ref(0)

// App update banner state
const showAppUpdateBanner = ref(false)
const appUpdateDismissed = ref(false)
const showDebug = ref(false)

// Data update snackbar state

// Logout dialog state
const logoutDialog = ref(false)

const isVerified = computed(() => {
  const user = userStore.getUser()
  // User is verified if they have any role other than 'unverified'
  return user?.roles?.some(r => r.id !== 'unverified') ?? false
})

const isAdmin = computed(() => {
  const user = userStore.getUser()
  return user?.roles?.some(r => r.id === 'administrator') ?? false
})

const canViewPackages = computed(() => userStore.hasPermission(PERMISSIONS.PACKAGES_VIEW))
const canViewSalesOrders = computed(() => userStore.hasPermission(PERMISSIONS.SALES_ORDERS_VIEW))

// Count of open (unclaimed) orders in the queue, shown as a nav badge.
const openSalesOrderCount = ref(0)
const fetchOpenSalesOrderCount = async () => {
  if (!canViewSalesOrders.value) {
    openSalesOrderCount.value = 0
    return
  }
  try {
    const orders = await api.salesOrders.list({ status: 'open' })
    openSalesOrderCount.value = orders.length
  } catch (error) {
    console.error('Failed to fetch open sales order count:', error)
    openSalesOrderCount.value = 0
  }
}

// Fetch pending approvals count for admins
const fetchPendingApprovalsCount = async () => {
  if (!isAdmin.value) {
    pendingApprovalsCount.value = 0
    return
  }
  try {
    const result = await api.admin.getPendingApprovalsCount()
    pendingApprovalsCount.value = result.count
  } catch (error) {
    console.error('Failed to fetch pending approvals count:', error)
    pendingApprovalsCount.value = 0
  }
}

// Watch for admin status changes
watch(isAdmin, newValue => {
  if (newValue) {
    fetchPendingApprovalsCount()
  } else {
    pendingApprovalsCount.value = 0
  }
})

const checkAuth = () => {
  isAuthenticated.value = !!getToken()
}

/**
 * Tear down the local session: clear credentials and all user-scoped stores,
 * stop background polling, and return to the login screen.
 */
const endSession = () => {
  clearCredentials()
  userStore.clearUser()
  invoicesStore.clearAll()
  shoppingListStore.clearList()
  isAuthenticated.value = false
  syncService.stopPolling()
  if (router.currentRoute.value.path !== '/login') {
    router.push('/login')
  }
}

const confirmLogout = () => {
  logoutDialog.value = false
  endSession()
}

// Validate the session on startup - validates token with server
const validateSession = async () => {
  const token = getToken()
  if (!token) return

  try {
    // Try to fetch user profile to validate the token
    const user = await api.account.getProfile()
    userStore.setUser(user)
    isAuthenticated.value = true
  } catch (error) {
    // Token is invalid
    console.warn('Session invalid:', error)
    // Only clear and redirect if the JWT in storage hasn't changed since
    // we started (prevents wiping a fresh token from a concurrent Discord
    // login callback in another tab or just-completed login flow).
    if (getToken() === token) {
      endSession()
    }
  }
}

// Handle token refresh events - re-fetch user profile to update roles.
//
// Tokens are now re-issued routinely (sliding expiry), not just when roles
// change, so this must not refetch on every refresh: each refetch can itself
// return a refreshed token, re-firing this handler in a loop. Only act when the
// roles encoded in the new token actually differ from what we have cached.
const handleTokenRefreshed = async (event: Event) => {
  const token = (event as CustomEvent<{ token?: string }>).detail?.token
  if (token && !rolesDifferFromCachedUser(token)) return

  try {
    const user = await api.account.getProfile()
    userStore.setUser(user)
    // Refresh counts after token refresh
    fetchPendingApprovalsCount()
    syncService.refreshSyncState()
  } catch (error) {
    console.error('Failed to refresh user profile:', error)
  }
}

// Listen for approval queue updates (emitted from AdminView)
const handleApprovalQueueUpdated = () => {
  fetchPendingApprovalsCount()
}

// Sync service event handlers
const handleAppVersionChanged = () => {
  if (!appUpdateDismissed.value) {
    showAppUpdateBanner.value = true
  }
}

const dismissAppUpdateBanner = () => {
  showAppUpdateBanner.value = false
  appUpdateDismissed.value = true
}

const refreshApp = () => {
  window.location.reload()
}

/**
 * Kick off everything that requires a valid, verified session.
 * Safe to call repeatedly — `startPolling` is idempotent.
 */
const startAuthenticatedSession = () => {
  commodityService.prefetch().catch(err => console.error('Failed to prefetch commodities:', err))
  locationService.prefetch().catch(err => console.error('Failed to load locations:', err))
  locationService
    .loadUserLocations()
    .catch(err => console.error('Failed to load user locations:', err))
  roleService.prefetch().catch(err => console.error('Failed to prefetch roles:', err))
  // Fetch pending approvals count for admins
  fetchPendingApprovalsCount()
  // Fetch open sales order count for the queue badge
  fetchOpenSalesOrderCount()
  // Start sync service polling
  syncService.startPolling()
}

// Drive background polling off the auth state rather than a one-shot check in
// onMounted. Logging in happens *after* mount, so the previous code never
// started polling for a session established in-page (only after a reload),
// and a 401 stopped it permanently.
watch(
  () => isAuthenticated.value && isVerified.value,
  active => {
    if (active) {
      startAuthenticatedSession()
    } else {
      syncService.stopPolling()
    }
  }
)

/**
 * Keep tabs in sync with credential changes made in *other* tabs.
 *
 * `storage` only fires in tabs that did not perform the write. Without this a
 * background tab keeps using the token it captured at load: after a re-login
 * elsewhere it 401s on every request, and after a logout elsewhere it carries
 * on looking signed in.
 */
const handleStorageChange = (event: StorageEvent) => {
  if (event.key !== JWT_STORAGE_KEY) return

  if (event.newValue === null) {
    // Logged out in another tab.
    endSession()
    return
  }

  // A newer token exists. Re-validate so this tab picks up the new identity
  // (roles may differ) rather than waiting to fail on the next request.
  isAuthenticated.value = true
  validateSession()
}

let unsubAuthFailure: (() => void) | null = null

onMounted(async () => {
  // Listen for token refresh events
  window.addEventListener('token-refreshed', handleTokenRefreshed)
  window.addEventListener('storage', handleStorageChange)
  window.addEventListener('approval-queue-updated', handleApprovalQueueUpdated)

  // Listen for sync events
  window.addEventListener(SYNC_EVENTS.APP_VERSION_CHANGED, handleAppVersionChanged)

  // Listen for centralized auth failures (401 from any API call)
  unsubAuthFailure = onAuthFailure(({ token }) => {
    // Guard: only tear down the session if the token that was rejected is
    // still the one we hold. If it has already been replaced (e.g. by a
    // Discord callback in another tab, or a just-completed login), this 401
    // is stale and the newer token takes precedence.
    //
    // NOTE: this must compare token *values*. A previous version checked
    // merely whether any token existed, which made this handler a no-op for
    // the common expired-token case and left the app wedged until a reload.
    if (token !== null && getToken() !== token) return

    endSession()
  })

  router.afterEach(() => {
    checkAuth()
    // Refresh the queue badge on navigation so it reflects claims/new orders.
    if (isAuthenticated.value && isVerified.value) fetchOpenSalesOrderCount()
  })

  // Validate session on startup (clears stale tokens). On success this flips
  // isAuthenticated, which the watcher above picks up to prefetch reference
  // data and start polling — so there is no explicit call here.
  await validateSession()
})

onUnmounted(() => {
  unsubAuthFailure?.()
  window.removeEventListener('token-refreshed', handleTokenRefreshed)
  window.removeEventListener('storage', handleStorageChange)
  window.removeEventListener('approval-queue-updated', handleApprovalQueueUpdated)
  window.removeEventListener(SYNC_EVENTS.APP_VERSION_CHANGED, handleAppVersionChanged)
  syncService.stopPolling()
})
</script>

<style scoped>
.navbar-logo {
  height: 32px;
  width: auto;
}

/* App update banner styling */
.app-update-banner :deep(.v-banner__content) {
  color: white;
}

.app-update-banner :deep(.v-banner__text) {
  color: white !important;
}

.app-update-banner :deep(.v-banner__actions .v-btn) {
  color: white !important;
}

.app-update-banner :deep(.v-icon) {
  color: white !important;
}
</style>

<style>
/* Global tooltip styling - must be unscoped since tooltips render in a portal */
.kawa-tooltip {
  background-color: rgb(var(--v-theme-surface-bright)) !important;
  color: rgb(var(--v-theme-on-surface)) !important;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  font-size: 0.875rem;
}
</style>
