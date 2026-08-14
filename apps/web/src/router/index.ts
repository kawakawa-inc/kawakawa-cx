import { createRouter, createWebHistory } from 'vue-router'
import LoginView from '../views/LoginView.vue'
import RegisterView from '../views/RegisterView.vue'
import ResetPasswordView from '../views/ResetPasswordView.vue'
import LinkDiscordView from '../views/LinkDiscordView.vue'
import DiscordCallbackView from '../views/DiscordCallbackView.vue'
import TermsView from '../views/TermsView.vue'
import PrivacyView from '../views/PrivacyView.vue'
import UnverifiedView from '../views/UnverifiedView.vue'
import MarketView from '../views/MarketView.vue'
import InventoryView from '../views/InventoryView.vue'
import MyOrdersView from '../views/MyOrdersView.vue'
import AccountView from '../views/AccountView.vue'
import AdminView from '../views/AdminView.vue'
import NotificationsView from '../views/NotificationsView.vue'
import PriceListView from '../views/PriceListView.vue'
import PriceAdjustmentsView from '../views/PriceAdjustmentsView.vue'
import PricingCalculatorView from '../views/PricingCalculatorView.vue'
import PackagesView from '../views/PackagesView.vue'
import SalesOrderCreateView from '../views/SalesOrderCreateView.vue'
import SalesOrderQueueView from '../views/SalesOrderQueueView.vue'
import LogisticsView from '../views/LogisticsView.vue'
import MyBasesView from '../views/MyBasesView.vue'
import CorpOverviewView from '../views/CorpOverviewView.vue'
import { hasSession, cachedUserRoles } from '../services/session'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: '/market',
    },
    {
      path: '/login',
      name: 'login',
      component: LoginView,
    },
    {
      path: '/register',
      name: 'register',
      component: RegisterView,
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: ResetPasswordView,
    },
    {
      path: '/link-discord',
      name: 'link-discord',
      component: LinkDiscordView,
    },
    {
      path: '/discord/callback',
      name: 'discord-callback',
      component: DiscordCallbackView,
    },
    {
      path: '/terms',
      name: 'terms',
      component: TermsView,
    },
    {
      path: '/privacy',
      name: 'privacy',
      component: PrivacyView,
    },
    {
      path: '/pending',
      name: 'pending',
      component: UnverifiedView,
      meta: { requiresAuth: true },
    },
    {
      path: '/market',
      name: 'market',
      component: MarketView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/inventory',
      name: 'inventory',
      component: InventoryView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/orders',
      name: 'my-orders',
      component: MyOrdersView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/account',
      name: 'account',
      component: AccountView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/notifications',
      name: 'notifications',
      component: NotificationsView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/admin',
      name: 'admin',
      component: AdminView,
      meta: { requiresAuth: true, requiresVerified: true, requiresAdmin: true },
    },
    {
      path: '/prices',
      name: 'prices',
      component: PriceListView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/prices/adjustments',
      name: 'price-adjustments',
      component: PriceAdjustmentsView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/calculator',
      name: 'calculator',
      component: PricingCalculatorView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/packages',
      name: 'packages',
      component: PackagesView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/sales-orders/new',
      name: 'sales-order-create',
      component: SalesOrderCreateView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/sales-orders',
      name: 'sales-order-queue',
      component: SalesOrderQueueView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/logistics',
      name: 'logistics',
      component: LogisticsView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/my-bases',
      name: 'my-bases',
      component: MyBasesView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      path: '/corp-overview',
      name: 'corp-overview',
      component: CorpOverviewView,
      meta: { requiresAuth: true, requiresVerified: true },
    },
    {
      // Old combined Burn & Repair page, split into /my-bases and /corp-overview.
      path: '/burn-repair',
      redirect: '/my-bases',
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/market',
    },
  ],
})

// Helper to check if user has a role.
//
// Reads the cached user blob, not the JWT: the session is an httpOnly cookie and
// is not readable from JS. These are presentation decisions only — every
// protected endpoint re-checks roles and permissions server-side, so a tampered
// cache changes which screen renders, never what the user may actually do.
const hasRole = (roleId: string): boolean => cachedUserRoles().includes(roleId)

// Check if user is verified (has any role other than 'unverified')
const isVerified = (): boolean => cachedUserRoles().some(id => id !== 'unverified')

// Navigation guard for authentication and authorization
router.beforeEach((to, _from, next) => {
  if (to.meta.requiresAuth && !hasSession()) {
    // Save the intended destination for post-login redirect
    const redirectPath = to.fullPath !== '/login' ? to.fullPath : '/market'
    next({
      path: '/login',
      query: { redirect: redirectPath },
    })
  } else if (to.meta.requiresVerified && !isVerified()) {
    // Redirect unverified users to pending page
    next({ path: '/pending' })
  } else if (to.meta.requiresAdmin && !hasRole('administrator')) {
    // Redirect non-admins away from admin pages
    next({ path: '/market' })
  } else {
    next()
  }
})

export default router
