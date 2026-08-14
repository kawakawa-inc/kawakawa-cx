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
            <v-btn v-bind="props" to="/market" icon size="small" class="mx-1" aria-label="Market">
              <v-icon>mdi-store</v-icon>
            </v-btn>
          </template>
          Market
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              to="/inventory"
              icon
              size="small"
              class="mx-1"
              aria-label="My Inventory"
            >
              <v-icon>mdi-package-variant</v-icon>
            </v-btn>
          </template>
          My Inventory
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              to="/orders"
              icon
              size="small"
              class="mx-1"
              aria-label="My Orders"
            >
              <v-icon>mdi-clipboard-list</v-icon>
            </v-btn>
          </template>
          My Orders
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              to="/prices"
              icon
              size="small"
              class="mx-1"
              aria-label="Price Lists"
            >
              <v-icon>mdi-tag-multiple</v-icon>
            </v-btn>
          </template>
          Price Lists
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              to="/calculator"
              icon
              size="small"
              class="mx-1"
              aria-label="Calculator"
            >
              <v-icon>mdi-calculator</v-icon>
            </v-btn>
          </template>
          Calculator
        </v-tooltip>
        <v-tooltip v-if="canViewPackages" location="bottom">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              to="/packages"
              icon
              size="small"
              class="mx-1"
              aria-label="Packages"
            >
              <v-icon>mdi-package-variant-closed</v-icon>
            </v-btn>
          </template>
          Packages
        </v-tooltip>
        <v-tooltip v-if="canViewSalesOrders" location="bottom">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              to="/sales-orders"
              icon
              size="small"
              class="mx-1"
              :aria-label="
                openSalesOrderCount > 0
                  ? `Sales Order Queue, ${openSalesOrderCount} open`
                  : 'Sales Order Queue'
              "
            >
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
            <v-btn v-bind="props" to="/logistics" icon size="small" class="mx-1" aria-label="Logistics">
              <v-icon>mdi-rocket-launch</v-icon>
            </v-btn>
          </template>
          Logistics
        </v-tooltip>
        -->
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              to="/my-bases"
              icon
              size="small"
              class="mx-1"
              aria-label="My Bases"
            >
              <v-icon>mdi-factory</v-icon>
            </v-btn>
          </template>
          My Bases
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              to="/corp-overview"
              icon
              size="small"
              class="mx-1"
              aria-label="Corp Overview"
            >
              <v-icon>mdi-chart-box</v-icon>
            </v-btn>
          </template>
          Corp Overview
        </v-tooltip>
        <v-tooltip location="bottom">
          <template #activator="{ props }">
            <v-btn v-bind="props" to="/account" icon size="small" class="mx-1" aria-label="Account">
              <v-icon>mdi-account-cog</v-icon>
            </v-btn>
          </template>
          Account
        </v-tooltip>
        <NotificationDropdown />
        <v-tooltip v-if="isAdmin" location="bottom">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              to="/admin"
              icon
              size="small"
              class="mx-1"
              :aria-label="
                pendingApprovalsCount > 0
                  ? `Admin, ${pendingApprovalsCount} pending approvals`
                  : 'Admin'
              "
            >
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
          <v-btn
            v-bind="props"
            icon
            size="small"
            class="mx-1"
            aria-label="Logout"
            @click="logoutDialog = true"
          >
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
import { onAuthFailure, ROLES_CHANGED_EVENT } from './services/authBus'
import {
  hasSession,
  presenceCookiePresent,
  clearCachedUser,
  markSessionDead,
  markSessionLive,
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
  isAuthenticated.value = hasSession()
}

/**
 * Screens that make no sense once a session exists.
 *
 * Deliberately just these two. The other unauthenticated routes are mid-flow
 * (`/reset-password`, `/link-discord`, `/discord/callback`) and navigating away
 * from them would abandon the thing the user is in the middle of — a Discord
 * link, in particular, is only completable from the page holding its token.
 */
const AUTH_SCREENS = new Set(['/login', '/register'])

/**
 * Tear down local session state and return to the login screen.
 *
 * `reason` distinguishes an expired session from a deliberate logout so the
 * login screen can explain what happened. Previously an expiry was
 * indistinguishable from a fresh visit, so the user saw a bare login form, tried
 * again, and appeared to loop.
 *
 * This only clears *tab-local* state. Two things are deliberately left alone:
 * the httpOnly session cookie (only the server can revoke it, via
 * `endSessionRemote`) and the shared presence cookie. An earlier version cleared
 * the latter, which is shared across tabs — so a stale tab's 401 still bounced
 * every other tab to /login. `markSessionDead()` is per-tab instead.
 *
 * Preserves where the user was as `?redirect=`, matching what the router guard
 * does, so signing back in returns them there instead of dumping them on
 * /market. This matters most for the case it was missing from: a session ended
 * elsewhere and noticed on tab focus, where the user did nothing to provoke it
 * and has the strongest expectation of landing back where they left off.
 *
 * `involuntary` drives that, not `reason`. The two are not the same thing: a
 * cross-tab sign-out passes no reason (there is nothing to explain — the user
 * knows, they did it in the other tab) but is still involuntary *for this tab*,
 * so keying the redirect off `reason` silently skipped exactly the case this
 * was meant to fix.
 */
const endSession = (
  reason?: 'expired' | 'logout-failed',
  { involuntary = true }: { involuntary?: boolean } = {}
) => {
  clearCachedUser()
  markSessionDead()
  userStore.clearUser()
  invoicesStore.clearAll()
  shoppingListStore.clearList()
  isAuthenticated.value = false
  syncService.stopPolling()

  const current = router.currentRoute.value
  if (current.path === '/login') return

  // A deliberate logout should not bounce the user back into the app, so only
  // an involuntary teardown carries a redirect.
  const keepDestination = involuntary && !AUTH_SCREENS.has(current.path)

  const query: Record<string, string> = {}
  if (reason) query.reason = reason
  if (keepDestination) query.redirect = current.fullPath

  router.push({ path: '/login', query })
}

/**
 * Deliberate logout: revoke the cookie server-side, then tear down locally.
 *
 * If the round-trip fails the session is still live server-side for up to the
 * cookie's lifetime, so say so rather than showing a clean login screen that
 * implies otherwise. Local teardown happens either way.
 */
const endSessionRemote = async () => {
  const { revoked } = await api.auth.logout()
  // The only genuinely voluntary teardown: the user asked to sign out, so do
  // not stash a redirect that would pull them back in on next login.
  endSession(revoked ? undefined : 'logout-failed', { involuntary: false })
}

const confirmLogout = () => {
  logoutDialog.value = false
  endSessionRemote()
}

// Validate the session on startup by fetching the profile. There is no token to
// inspect locally — the cookie is opaque to JS — so the server is the only
// authority on whether the session is live.
const validateSession = async () => {
  if (!hasSession()) return

  try {
    const user = await api.account.getProfile()
    userStore.setUser(user)
    isAuthenticated.value = true
  } catch (error) {
    console.warn('Session invalid:', error)
    endSession('expired')
  }
}

// Re-fetch the profile when the server reports the session's roles changed.
//
// Fires only on actual role drift (`X-Roles-Changed`), not on every sliding
// renewal. The server is the one that knows, since the SPA can no longer read
// the JWT.
//
// `refreshingRoles` makes this non-reentrant, and that guard is load-bearing.
// The refetch is itself an authenticated request, so its *own* response carries
// `X-Roles-Changed` while the drift persists — which re-enters this handler,
// which refetches again. Measured at ~140 requests/second in a tight loop until
// the cookie caught up, and the concurrent in-flight requests it generated were
// what made a password change 401 and bounce the user to /login: six stale-token
// requests were airborne at the moment `tokenVersion` was bumped.
let refreshingRoles = false

const handleRolesChanged = async () => {
  if (refreshingRoles) return
  refreshingRoles = true

  try {
    const user = await api.account.getProfile()
    userStore.setUser(user)
    // Refresh counts now the role set may differ
    fetchPendingApprovalsCount()
    syncService.refreshSyncState()
  } catch (error) {
    console.error('Failed to refresh user profile:', error)
  } finally {
    refreshingRoles = false
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
 * Send a tab sitting on a sign-in screen to the app after a session appears.
 *
 * Adopting the session used to only flip `isAuthenticated`, which rendered the
 * signed-in navbar *over the login form* and left the tab stranded there: the
 * router guard blocks entry to protected routes but nothing pushes an
 * already-`/login` tab off it. `endSession()` has always navigated on the way
 * out, so the two directions were asymmetric.
 *
 * Honours the `redirect` query the guard stored, so a tab bounced from a deep
 * link lands where it was originally headed rather than on /market.
 */
const leaveAuthScreen = () => {
  // The session may have been rejected in the meantime — `validateSession()`
  // calls `endSession()`, which lands the tab back on /login deliberately. Do
  // not drag it out of there.
  if (!isAuthenticated.value) return

  const current = router.currentRoute.value
  if (!AUTH_SCREENS.has(current.path)) return

  // Only follow a same-origin path. `redirect` comes from the query string, so
  // treating it as a bare URL would let a crafted link bounce the user offsite.
  const redirect = current.query.redirect
  const target =
    typeof redirect === 'string' && redirect.startsWith('/') && !redirect.startsWith('//')
      ? redirect
      : '/market'
  router.replace(target)
}

/**
 * Notice a session that appeared or disappeared in another tab.
 *
 * The cookie jar is shared, so this tab's *requests* already use the current
 * session without any help — this only keeps the rendered UI honest.
 *
 * Runs on focus rather than a `storage` event because cookie changes fire no
 * event. The trade-off versus the old `storage` listener: a tab that is already
 * visible will not notice a logout elsewhere until it is re-focused or makes its
 * next request. Acceptable, since the stale view is read-only — any action it
 * attempts fails server-side and routes through the normal 401 teardown.
 */
const handleVisibilityChange = () => {
  if (document.visibilityState !== 'visible') return

  // A tab being re-focused is the moment it is most likely to be both stale and
  // about to be used. Checked here rather than only from the sync poll: a tab
  // that has already 401'd has stopped polling, and one whose session is still
  // valid never reaches the poll's error path at all — so neither would ever
  // self-evict. Idempotent, and no-ops once a reload has been triggered.
  void syncService.evictIfStale()

  // Raw cookie read, not `hasSession()`: if this tab previously 401'd its
  // dead-session flag is set, and `hasSession()` would keep answering false —
  // leaving the tab wedged even after a real login elsewhere.
  const present = presenceCookiePresent()
  if (present && !isAuthenticated.value) {
    // Signed in elsewhere: adopt the session rather than waiting to fail.
    markSessionLive()
    isAuthenticated.value = true
    // Navigate only *after* the profile lands. The router's `requiresVerified`
    // guard reads roles from the cached user blob, so leaving the login screen
    // first sent an administrator to /pending — the guard saw an empty role set
    // because the profile fetch had not resolved yet.
    void validateSession().then(leaveAuthScreen)
  } else if (!present && isAuthenticated.value) {
    // Signed out (or expired) elsewhere.
    endSession()
  }
}

let unsubAuthFailure: (() => void) | null = null

onMounted(async () => {
  window.addEventListener(ROLES_CHANGED_EVENT, handleRolesChanged)
  window.addEventListener('approval-queue-updated', handleApprovalQueueUpdated)
  document.addEventListener('visibilitychange', handleVisibilityChange)

  // Listen for sync events
  window.addEventListener(SYNC_EVENTS.APP_VERSION_CHANGED, handleAppVersionChanged)

  // Listen for centralized auth failures (401 from any API call).
  //
  // No token comparison guard is needed any more: with a single shared cookie
  // per browser there is only one session, so a 401 is unambiguous. The teardown
  // is also local-only, so it cannot revoke a session other tabs are using.
  unsubAuthFailure = onAuthFailure(() => {
    endSession('expired')
  })

  router.afterEach(() => {
    checkAuth()
    // Refresh the queue badge on navigation so it reflects claims/new orders.
    if (isAuthenticated.value && isVerified.value) fetchOpenSalesOrderCount()
  })

  // A bundle restored from bfcache or a long-suspended tab can mount against a
  // deploy that has since moved on. Fire-and-forget so it never delays startup.
  void syncService.evictIfStale()

  // Validate session on startup (clears stale tokens). On success this flips
  // isAuthenticated, which the watcher above picks up to prefetch reference
  // data and start polling — so there is no explicit call here.
  await validateSession()
})

onUnmounted(() => {
  unsubAuthFailure?.()
  window.removeEventListener(ROLES_CHANGED_EVENT, handleRolesChanged)
  window.removeEventListener('approval-queue-updated', handleApprovalQueueUpdated)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
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
