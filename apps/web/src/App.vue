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
import { onAuthFailure, handleAuthFailure } from './services/authBus'
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
  isAuthenticated.value = !!localStorage.getItem('jwt')
}

const confirmLogout = () => {
  logoutDialog.value = false
  localStorage.removeItem('jwt')
  handleAuthFailure()
  userStore.clearUser()
  invoicesStore.clearAll()
  shoppingListStore.clearList()
  isAuthenticated.value = false
  router.push('/login')
}

// Validate the session on startup - validates token with server
const validateSession = async () => {
  const token = localStorage.getItem('jwt')
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
    const currentToken = localStorage.getItem('jwt')
    if (currentToken === token) {
      localStorage.removeItem('jwt')
      userStore.clearUser()
      invoicesStore.clearAll()
      shoppingListStore.clearList()
      isAuthenticated.value = false
      router.push('/login')
    }
  }
}

// Handle token refresh events - re-fetch user profile to update roles
const handleTokenRefreshed = async () => {
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

let unsubAuthFailure: (() => void) | null = null

onMounted(async () => {
  // Listen for token refresh events
  window.addEventListener('token-refreshed', handleTokenRefreshed)
  window.addEventListener('approval-queue-updated', handleApprovalQueueUpdated)

  // Listen for sync events
  window.addEventListener(SYNC_EVENTS.APP_VERSION_CHANGED, handleAppVersionChanged)

  // Listen for centralized auth failures (401 from any API call)
  unsubAuthFailure = onAuthFailure(() => {
    // Guard: if a fresh JWT has appeared in localStorage (e.g. from a
    // Discord callback in another tab, or a just-completed login flow),
    // don't wipe the session — the new token takes precedence.
    if (localStorage.getItem('jwt')) return

    userStore.clearUser()
    invoicesStore.clearAll()
    shoppingListStore.clearList()
    isAuthenticated.value = false
    router.push('/login')
  })

  router.afterEach(() => {
    checkAuth()
    // Refresh the queue badge on navigation so it reflects claims/new orders.
    if (isAuthenticated.value && isVerified.value) fetchOpenSalesOrderCount()
  })

  // Validate session on startup (clears stale tokens)
  await validateSession()

  // Prefetch reference data if authenticated and verified
  if (isAuthenticated.value && isVerified.value) {
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
})

onUnmounted(() => {
  unsubAuthFailure?.()
  window.removeEventListener('token-refreshed', handleTokenRefreshed)
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
