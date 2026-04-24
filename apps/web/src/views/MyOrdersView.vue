<template>
  <v-container fluid>
    <h1 class="text-h4 mb-4">My Orders</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <v-tabs v-model="activeTab" class="mb-4">
      <v-tab value="buy">
        <v-icon start>mdi-cart</v-icon>
        Buy Orders
        <v-badge
          v-if="buyOrders.length > 0"
          :content="buyOrders.length"
          color="primary"
          inline
          class="ml-2"
        />
      </v-tab>
      <v-tab value="sell">
        <v-icon start>mdi-tag</v-icon>
        Sell Orders
        <v-badge
          v-if="sellOrders.length > 0"
          :content="sellOrders.length"
          color="success"
          inline
          class="ml-2"
        />
      </v-tab>
      <v-tab value="invoices">
        <v-icon start>mdi-file-document-multiple</v-icon>
        Invoices
        <v-badge
          v-if="activeInvoicesCount > 0"
          :content="activeInvoicesCount"
          color="warning"
          inline
          class="ml-2"
        />
      </v-tab>
    </v-tabs>

    <v-tabs-window v-model="activeTab">
      <!-- SELL ORDERS TAB -->
      <v-tabs-window-item value="sell">
        <v-card>
          <v-card-title>
            <v-row align="center">
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="sellSearch"
                  prepend-icon="mdi-magnify"
                  label="Search sell orders..."
                  single-line
                  hide-details
                  clearable
                  density="compact"
                />
              </v-col>
              <v-col cols="12" md="6" class="text-right">
                <v-tooltip
                  :disabled="canCreateAnyOrders"
                  text="You do not have permission to create orders"
                  location="bottom"
                >
                  <template #activator="{ props }">
                    <span v-bind="props">
                      <v-btn
                        color="success"
                        prepend-icon="mdi-plus"
                        :disabled="!canCreateAnyOrders"
                        @click="openSellOrderDialog"
                      >
                        Create Sell Order
                      </v-btn>
                    </span>
                  </template>
                </v-tooltip>
              </v-col>
            </v-row>
          </v-card-title>

          <v-data-table
            :headers="sellHeaders"
            :items="filteredSellOrders"
            :loading="loadingSell"
            :items-per-page="25"
            :class="['elevation-0', { 'icon-rows': hasIcons }]"
          >
            <template #item.commodityTicker="{ item }">
              <CommodityDisplay :ticker="item.commodityTicker" class="font-weight-medium" />
            </template>

            <template #item.locationId="{ item }">
              {{ getLocationDisplay(item.locationId) }}
            </template>

            <template #item.price="{ item }">
              <div class="d-flex align-center">
                <template v-if="getSellOrderDisplayPrice(item) !== null">
                  <span class="font-weight-medium">{{
                    formatPrice(getSellOrderDisplayPrice(item)!)
                  }}</span>
                  <span class="text-medium-emphasis ml-1">{{ item.currency }}</span>
                </template>
                <span v-else class="text-medium-emphasis">--</span>
                <v-chip
                  v-if="item.priceListCode"
                  size="x-small"
                  color="info"
                  variant="tonal"
                  class="ml-2"
                >
                  {{ item.priceListCode }}
                </v-chip>
                <v-chip v-else size="x-small" color="default" variant="outlined" class="ml-2">
                  Custom
                </v-chip>
              </div>
            </template>

            <template #item.availableQuantity="{ item }">
              <v-tooltip location="top">
                <template #activator="{ props }">
                  <div v-bind="props">
                    <span class="font-weight-medium">{{
                      item.remainingQuantity.toLocaleString()
                    }}</span>
                    <span v-if="item.reservedQuantity > 0" class="text-medium-emphasis">
                      / {{ item.availableQuantity.toLocaleString() }}
                    </span>
                  </div>
                </template>
                <div>
                  <div>FIO Inventory: {{ item.fioQuantity.toLocaleString() }}</div>
                  <div>Available: {{ item.availableQuantity.toLocaleString() }}</div>
                  <div v-if="item.reservedQuantity > 0">
                    Reserved: {{ item.reservedQuantity.toLocaleString() }}
                  </div>
                  <div>Remaining: {{ item.remainingQuantity.toLocaleString() }}</div>
                </div>
              </v-tooltip>
              <div v-if="item.limitMode !== 'none'" class="text-caption text-medium-emphasis">
                {{ getLimitModeLabel(item.limitMode) }}
                <span v-if="item.limitQuantity">: {{ item.limitQuantity.toLocaleString() }}</span>
              </div>
            </template>

            <template #item.activeReservationCount="{ item }">
              <v-chip
                v-if="item.activeReservationCount > 0"
                size="small"
                color="primary"
                variant="tonal"
                class="cursor-pointer"
                @click="viewSellOrder(item)"
              >
                {{ item.activeReservationCount }}
              </v-chip>
              <span v-else class="text-medium-emphasis">-</span>
            </template>

            <template #item.orderType="{ item }">
              <OrderTypeChip :order-type="item.orderType" />
            </template>

            <template #item.actions="{ item }">
              <div class="d-flex ga-1">
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      @click="viewSellOrder(item)"
                    >
                      <v-icon>mdi-eye</v-icon>
                    </v-btn>
                  </template>
                  View order
                </v-tooltip>
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      @click="openEditSellDialog(item)"
                    >
                      <v-icon>mdi-pencil</v-icon>
                    </v-btn>
                  </template>
                  Edit order
                </v-tooltip>
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      color="error"
                      @click="confirmDeleteSell(item)"
                    >
                      <v-icon>mdi-delete</v-icon>
                    </v-btn>
                  </template>
                  Delete order
                </v-tooltip>
              </div>
            </template>

            <template #no-data>
              <div class="text-center py-8">
                <v-icon size="64" color="grey-lighten-1">mdi-tag-multiple</v-icon>
                <p class="text-h6 mt-4">No sell orders</p>
                <p class="text-body-2 text-medium-emphasis">
                  Create sell orders to list items for sale
                </p>
                <v-tooltip
                  :disabled="canCreateAnyOrders"
                  text="You do not have permission to create orders"
                  location="bottom"
                >
                  <template #activator="{ props }">
                    <span v-bind="props">
                      <v-btn
                        color="success"
                        class="mt-4"
                        prepend-icon="mdi-plus"
                        :disabled="!canCreateAnyOrders"
                        @click="openSellOrderDialog"
                      >
                        Create Sell Order
                      </v-btn>
                    </span>
                  </template>
                </v-tooltip>
              </div>
            </template>
          </v-data-table>
        </v-card>
      </v-tabs-window-item>

      <!-- BUY ORDERS TAB -->
      <v-tabs-window-item value="buy">
        <v-card>
          <v-card-title>
            <v-row align="center">
              <v-col cols="12" md="6">
                <v-text-field
                  v-model="buySearch"
                  prepend-icon="mdi-magnify"
                  label="Search buy orders..."
                  single-line
                  hide-details
                  clearable
                  density="compact"
                />
              </v-col>
              <v-col cols="12" md="6" class="text-right">
                <v-tooltip
                  :disabled="canCreateAnyOrders"
                  text="You do not have permission to create orders"
                  location="bottom"
                >
                  <template #activator="{ props }">
                    <span v-bind="props">
                      <v-btn
                        color="primary"
                        prepend-icon="mdi-plus"
                        :disabled="!canCreateAnyOrders"
                        @click="openBuyOrderDialog"
                      >
                        Create Buy Order
                      </v-btn>
                    </span>
                  </template>
                </v-tooltip>
              </v-col>
            </v-row>
          </v-card-title>

          <v-data-table
            :headers="buyHeaders"
            :items="filteredBuyOrders"
            :loading="loadingBuy"
            :items-per-page="25"
            :class="['elevation-0', { 'icon-rows': hasIcons }]"
          >
            <template #item.commodityTicker="{ item }">
              <CommodityDisplay :ticker="item.commodityTicker" class="font-weight-medium" />
            </template>

            <template #item.locationId="{ item }">
              {{ getLocationDisplay(item.locationId) }}
            </template>

            <template #item.price="{ item }">
              <div class="d-flex align-center">
                <template v-if="getBuyOrderDisplayPrice(item) !== null">
                  <span class="font-weight-medium">{{
                    formatPrice(getBuyOrderDisplayPrice(item)!)
                  }}</span>
                  <span class="text-medium-emphasis ml-1">{{ item.currency }}</span>
                </template>
                <span v-else class="text-medium-emphasis">--</span>
                <v-chip
                  v-if="item.priceListCode"
                  size="x-small"
                  color="info"
                  variant="tonal"
                  class="ml-2"
                >
                  {{ item.priceListCode }}
                </v-chip>
                <v-chip v-else size="x-small" color="default" variant="outlined" class="ml-2">
                  Custom
                </v-chip>
              </div>
            </template>

            <template #item.quantity="{ item }">
              <v-tooltip location="top">
                <template #activator="{ props }">
                  <span v-bind="props" class="font-weight-medium">
                    {{ item.remainingQuantity.toLocaleString() }}
                    <span v-if="item.reservedQuantity > 0" class="text-medium-emphasis">
                      / {{ item.quantity.toLocaleString() }}
                    </span>
                  </span>
                </template>
                <div>
                  <div>Total: {{ item.quantity.toLocaleString() }}</div>
                  <div v-if="item.reservedQuantity > 0">
                    Filled: {{ item.reservedQuantity.toLocaleString() }}
                  </div>
                  <div>Remaining: {{ item.remainingQuantity.toLocaleString() }}</div>
                </div>
              </v-tooltip>
            </template>

            <template #item.activeReservationCount="{ item }">
              <v-chip
                v-if="item.activeReservationCount > 0"
                size="small"
                color="primary"
                variant="tonal"
                class="cursor-pointer"
                @click="viewBuyOrder(item)"
              >
                {{ item.activeReservationCount }}
              </v-chip>
              <span v-else class="text-medium-emphasis">-</span>
            </template>

            <template #item.orderType="{ item }">
              <OrderTypeChip :order-type="item.orderType" />
            </template>

            <template #item.actions="{ item }">
              <div class="d-flex ga-1">
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      @click="viewBuyOrder(item)"
                    >
                      <v-icon>mdi-eye</v-icon>
                    </v-btn>
                  </template>
                  View order
                </v-tooltip>
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      @click="openEditBuyDialog(item)"
                    >
                      <v-icon>mdi-pencil</v-icon>
                    </v-btn>
                  </template>
                  Edit order
                </v-tooltip>
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      color="error"
                      @click="confirmDeleteBuy(item)"
                    >
                      <v-icon>mdi-delete</v-icon>
                    </v-btn>
                  </template>
                  Delete order
                </v-tooltip>
              </div>
            </template>

            <template #no-data>
              <div class="text-center py-8">
                <v-icon size="64" color="grey-lighten-1">mdi-cart</v-icon>
                <p class="text-h6 mt-4">No buy orders</p>
                <p class="text-body-2 text-medium-emphasis">
                  Create buy orders to request items from other members
                </p>
                <v-tooltip
                  :disabled="canCreateAnyOrders"
                  text="You do not have permission to create orders"
                  location="bottom"
                >
                  <template #activator="{ props }">
                    <span v-bind="props">
                      <v-btn
                        color="primary"
                        class="mt-4"
                        prepend-icon="mdi-plus"
                        :disabled="!canCreateAnyOrders"
                        @click="openBuyOrderDialog"
                      >
                        Create Buy Order
                      </v-btn>
                    </span>
                  </template>
                </v-tooltip>
              </div>
            </template>
          </v-data-table>
        </v-card>
      </v-tabs-window-item>

      <!-- INVOICES TAB -->
      <v-tabs-window-item value="invoices">
        <v-card>
          <v-card-title>
            <v-row align="center">
              <v-col cols="12" md="5">
                <TokenSearchInput
                  placeholder="Search: user, commodity..."
                  :available-user-names="availableInvoiceUserNames"
                  :get-commodity-display="getCommodityDisplay"
                  :get-location-display="getLocationDisplay"
                  :get-commodity-name="getCommodityName"
                  :help-tokens="invoiceHelpTokens"
                  @update:chips="invoiceSearchChips = $event"
                />
              </v-col>
              <v-col cols="12" md="2">
                <v-select
                  v-model="invoiceDirectionFilter"
                  :items="invoiceDirectionOptions"
                  item-title="title"
                  item-value="value"
                  label="Direction"
                  density="compact"
                  hide-details
                  clearable
                />
              </v-col>
              <v-col cols="12" md="5">
                <v-select
                  v-model="invoiceStatusFilter"
                  :items="invoiceStatusOptions"
                  item-title="title"
                  item-value="value"
                  label="Status"
                  density="compact"
                  hide-details
                  multiple
                  chips
                  closable-chips
                >
                  <template #prepend-item>
                    <v-list-item
                      :title="isShowingAll ? 'Hide Completed' : 'Show All'"
                      @click="toggleShowAllStatuses"
                    >
                      <template #prepend>
                        <v-icon>{{ isShowingAll ? 'mdi-filter' : 'mdi-filter-off' }}</v-icon>
                      </template>
                    </v-list-item>
                    <v-divider class="mt-2" />
                  </template>
                </v-select>
              </v-col>
            </v-row>
          </v-card-title>

          <!-- Invoice Summary Card -->
          <v-card-text v-if="invoiceSummary.totalItems > 0" class="pt-0 pb-4">
            <v-row dense>
              <!-- Counts -->
              <v-col cols="12" md="3">
                <div class="text-caption text-medium-emphasis mb-1">Active Invoices</div>
                <div class="d-flex align-center ga-4">
                  <div>
                    <span class="text-h5 font-weight-bold">{{ activeInvoicesCount }}</span>
                    <span class="text-caption text-medium-emphasis ml-1">open</span>
                  </div>
                  <v-divider vertical class="mx-2" />
                  <div>
                    <span class="text-body-1 font-weight-medium">{{
                      invoiceSummary.totalItems
                    }}</span>
                    <span class="text-caption text-medium-emphasis ml-1">items</span>
                  </div>
                </div>
              </v-col>

              <!-- Selling Total (money in = green) -->
              <v-col cols="12" md="3">
                <div class="text-caption text-medium-emphasis mb-1">
                  <v-icon size="small" color="success" class="mr-1">mdi-arrow-up</v-icon>
                  Selling (you receive)
                </div>
                <div v-if="Object.keys(invoiceSummary.sellTotals).length > 0">
                  <div
                    v-for="(amount, currency) in invoiceSummary.sellTotals"
                    :key="currency"
                    class="text-success"
                  >
                    <span class="font-weight-medium">+{{ formatPrice(amount) }}</span>
                    <span class="text-caption ml-1">{{ currency }}</span>
                  </div>
                </div>
                <div v-else class="text-medium-emphasis">--</div>
              </v-col>

              <!-- Buying Total (money out = yellow) -->
              <v-col cols="12" md="3">
                <div class="text-caption text-medium-emphasis mb-1">
                  <v-icon size="small" color="warning" class="mr-1">mdi-arrow-down</v-icon>
                  Buying (you pay)
                </div>
                <div v-if="Object.keys(invoiceSummary.buyTotals).length > 0">
                  <div
                    v-for="(amount, currency) in invoiceSummary.buyTotals"
                    :key="currency"
                    class="text-warning"
                  >
                    <span class="font-weight-medium">-{{ formatPrice(amount) }}</span>
                    <span class="text-caption ml-1">{{ currency }}</span>
                  </div>
                </div>
                <div v-else class="text-medium-emphasis">--</div>
              </v-col>

              <!-- Net Total -->
              <v-col cols="12" md="3">
                <div class="text-caption text-medium-emphasis mb-1">
                  <v-icon size="small" class="mr-1">mdi-scale-balance</v-icon>
                  Net Position
                </div>
                <div v-if="Object.keys(invoiceSummary.netTotals).length > 0">
                  <div
                    v-for="(amount, currency) in invoiceSummary.netTotals"
                    :key="currency"
                    :class="amount >= 0 ? 'text-success' : 'text-warning'"
                  >
                    <span class="font-weight-medium">
                      {{ amount >= 0 ? '+' : '' }}{{ formatPrice(amount) }}
                    </span>
                    <span class="text-caption ml-1">{{ currency }}</span>
                  </div>
                </div>
                <div v-else class="text-medium-emphasis">--</div>
              </v-col>
            </v-row>
          </v-card-text>

          <v-divider v-if="invoiceSummary.totalItems > 0" />

          <v-data-table
            v-model:expanded="expandedInvoices"
            :headers="invoiceHeaders"
            :items="filteredInvoices"
            :loading="loadingInvoices"
            :items-per-page="25"
            :row-props="getInvoiceRowProps"
            class="elevation-0 clickable-rows"
            show-expand
            item-value="id"
            @click:row="toggleInvoiceExpand"
          >
            <!-- Custom expand toggle with right/down chevron -->
            <template #item.data-table-expand="{ internalItem, isExpanded, toggleExpand }">
              <v-btn icon variant="text" size="small" @click.stop="toggleExpand(internalItem)">
                <v-icon>{{
                  isExpanded(internalItem) ? 'mdi-chevron-down' : 'mdi-chevron-right'
                }}</v-icon>
              </v-btn>
            </template>

            <template #item.direction="{ item }">
              <v-chip
                :color="item.direction === 'sent' ? 'primary' : 'info'"
                size="small"
                variant="tonal"
              >
                <v-icon start size="small">{{
                  item.direction === 'sent' ? 'mdi-arrow-up' : 'mdi-arrow-down'
                }}</v-icon>
                {{ item.direction === 'sent' ? 'Sent' : 'Received' }}
              </v-chip>
            </template>

            <template #item.counterpartyName="{ item }">
              <span class="font-weight-medium">{{ item.counterpartyName }}</span>
              <div class="text-caption text-medium-emphasis">
                {{ item.direction === 'sent' ? 'To' : 'From' }}
              </div>
            </template>

            <template #item.commodities="{ item }">
              <div class="commodity-grid">
                <CommodityIcon
                  v-for="ticker in item.commodityTickers.slice(0, 12)"
                  :key="ticker"
                  :commodity="getCommodityObj(ticker)"
                  class="commodity-grid-icon"
                />
                <v-tooltip v-if="item.commodityTickers.length > 12" location="top">
                  <template #activator="{ props: tooltipProps }">
                    <span v-bind="tooltipProps" class="commodity-grid-more">
                      +{{ item.commodityTickers.length - 12 }}
                    </span>
                  </template>
                  {{ item.commodityTickers.join(', ') }}
                </v-tooltip>
              </div>
            </template>

            <template #item.status="{ item }">
              <InvoiceStatusChip :status="item.status" size="small" />
            </template>

            <template #item.buyItemCount="{ item }">
              <span class="font-weight-medium">{{ getMyBuyItemCount(item) }}</span>
            </template>

            <template #item.sellItemCount="{ item }">
              <span class="font-weight-medium">{{ getMySellItemCount(item) }}</span>
            </template>

            <template #item.buyTotals="{ item }">
              <div class="text-right">
                <div
                  v-for="total in getMyBuyTotals(item)"
                  :key="total.currency"
                  class="text-caption text-warning"
                >
                  <span class="font-weight-medium">{{ formatPrice(total.total) }}</span>
                  <span class="ml-1">{{ total.currency }}</span>
                </div>
                <span v-if="getMyBuyTotals(item).length === 0" class="text-medium-emphasis"
                  >--</span
                >
              </div>
            </template>

            <template #item.sellTotals="{ item }">
              <div class="text-right">
                <div
                  v-for="total in getMySellTotals(item)"
                  :key="total.currency"
                  class="text-caption text-success"
                >
                  <span class="font-weight-medium">{{ formatPrice(total.total) }}</span>
                  <span class="ml-1">{{ total.currency }}</span>
                </div>
                <span v-if="getMySellTotals(item).length === 0" class="text-medium-emphasis"
                  >--</span
                >
              </div>
            </template>

            <template #item.createdAt="{ item }">
              <v-tooltip location="top">
                <template #activator="{ props: tooltipProps }">
                  <span v-bind="tooltipProps" class="text-caption text-medium-emphasis">
                    {{ formatFuzzyTime(item.createdAt) }}
                  </span>
                </template>
                {{ formatFullDate(item.createdAt) }}
              </v-tooltip>
            </template>

            <template #item.updatedAt="{ item }">
              <v-tooltip location="top">
                <template #activator="{ props: tooltipProps }">
                  <span v-bind="tooltipProps" class="text-caption text-medium-emphasis">
                    {{ formatFuzzyTime(item.updatedAt) }}
                  </span>
                </template>
                {{ formatFullDate(item.updatedAt) }}
              </v-tooltip>
            </template>

            <template #item.actions="{ item }">
              <div class="d-flex ga-1 align-center">
                <v-tooltip location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      @click="viewInvoice(item)"
                    >
                      <v-icon>mdi-eye</v-icon>
                    </v-btn>
                  </template>
                  View invoice
                </v-tooltip>

                <!-- Bulk actions for received invoices -->
                <template v-if="item.direction === 'received' && item.status !== 'draft'">
                  <v-tooltip v-if="canConfirmAll(item)" location="top">
                    <template #activator="{ props }">
                      <v-btn
                        v-bind="props"
                        icon
                        size="small"
                        variant="text"
                        color="success"
                        :loading="invoiceActionLoading === `confirm-${item.id}`"
                        :disabled="invoiceActionLoading !== null"
                        @click.stop="confirmAllReservations(item)"
                      >
                        <v-icon>mdi-check-all</v-icon>
                      </v-btn>
                    </template>
                    Confirm All
                  </v-tooltip>

                  <v-tooltip v-if="canRejectAll(item)" location="top">
                    <template #activator="{ props }">
                      <v-btn
                        v-bind="props"
                        icon
                        size="small"
                        variant="text"
                        color="error"
                        :loading="invoiceActionLoading === `reject-${item.id}`"
                        :disabled="invoiceActionLoading !== null"
                        @click.stop="rejectAllReservations(item)"
                      >
                        <v-icon>mdi-close-circle</v-icon>
                      </v-btn>
                    </template>
                    Reject All
                  </v-tooltip>

                  <v-tooltip v-if="canFulfillAll(item)" location="top">
                    <template #activator="{ props }">
                      <v-btn
                        v-bind="props"
                        icon
                        size="small"
                        variant="text"
                        color="primary"
                        :loading="invoiceActionLoading === `fulfill-${item.id}`"
                        :disabled="invoiceActionLoading !== null"
                        @click.stop="fulfillAllReservations(item)"
                      >
                        <v-icon>mdi-package-variant-closed-check</v-icon>
                      </v-btn>
                    </template>
                    Fulfill All
                  </v-tooltip>
                </template>

                <!-- Fulfill for sent invoices (pending, confirmed, partially_fulfilled) -->
                <v-tooltip
                  v-if="
                    item.direction === 'sent' &&
                    ['pending', 'confirmed', 'partially_fulfilled'].includes(item.status)
                  "
                  location="top"
                >
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      color="success"
                      :loading="invoiceActionLoading === `fulfill-${item.id}`"
                      :disabled="invoiceActionLoading !== null"
                      @click.stop="fulfillInvoice(item)"
                    >
                      <v-icon>mdi-check-all</v-icon>
                    </v-btn>
                  </template>
                  Fulfill Invoice
                </v-tooltip>

                <!-- Cancel for sent invoices -->
                <v-tooltip
                  v-if="item.direction === 'sent' && item.status === 'pending'"
                  location="top"
                >
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      color="warning"
                      :loading="invoiceActionLoading === `cancel-${item.id}`"
                      :disabled="invoiceActionLoading !== null"
                      @click.stop="cancelInvoice(item)"
                    >
                      <v-icon>mdi-cancel</v-icon>
                    </v-btn>
                  </template>
                  Cancel Invoice
                </v-tooltip>

                <!-- Delete for drafts -->
                <v-tooltip v-if="item.status === 'draft'" location="top">
                  <template #activator="{ props }">
                    <v-btn
                      v-bind="props"
                      icon
                      size="small"
                      variant="text"
                      color="error"
                      @click.stop="confirmDeleteInvoice(item)"
                    >
                      <v-icon>mdi-delete</v-icon>
                    </v-btn>
                  </template>
                  Delete draft
                </v-tooltip>
              </div>
            </template>

            <!-- Expanded row content -->
            <template #expanded-row="{ columns, item }">
              <tr class="expanded-row">
                <td :colspan="columns.length" class="pa-0">
                  <InvoiceExpandedRow
                    :key="invoiceRefreshKey"
                    :invoice-id="item.id"
                    :direction="item.direction"
                    @updated="loadInvoices"
                  />
                </td>
              </tr>
            </template>

            <template #no-data>
              <div class="text-center py-8">
                <v-icon size="64" color="grey-lighten-1">mdi-file-document-multiple</v-icon>
                <p class="text-h6 mt-4">No invoices</p>
                <p class="text-body-2 text-medium-emphasis">Your invoices will appear here</p>
              </div>
            </template>
          </v-data-table>
        </v-card>
      </v-tabs-window-item>
    </v-tabs-window>

    <!-- Order Dialog -->
    <OrderDialog v-model="orderDialog" :initial-tab="orderDialogTab" @created="onOrderCreated" />

    <!-- Order Detail Dialog -->
    <OrderDetailDialog
      v-model="orderDetailDialog"
      :order-type="orderDetailType"
      :order-id="orderDetailId"
      @deleted="onOrderDeleted"
      @updated="onOrderUpdated"
    />

    <!-- Edit Sell Order Dialog -->
    <SellOrderEditDialog
      v-model="editSellDialog"
      :order="editingSellOrder"
      @saved="onSellOrderSaved"
    />

    <!-- Edit Buy Order Dialog -->
    <BuyOrderEditDialog v-model="editBuyDialog" :order="editingBuyOrder" @saved="onBuyOrderSaved" />

    <!-- Delete Sell Order Confirmation -->
    <v-dialog v-model="deleteSellDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Sell Order</v-card-title>
        <v-card-text>
          Are you sure you want to delete the sell order for
          <strong>{{
            deletingSellOrder ? getCommodityDisplay(deletingSellOrder.commodityTicker) : ''
          }}</strong>
          at
          <strong>{{
            deletingSellOrder ? getLocationDisplay(deletingSellOrder.locationId) : ''
          }}</strong
          >?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteSellDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deletingSell" @click="deleteSellOrder"> Delete </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Buy Order Confirmation -->
    <v-dialog v-model="deleteBuyDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Buy Order</v-card-title>
        <v-card-text>
          Are you sure you want to delete the buy order for
          <strong>{{
            deletingBuyOrder ? getCommodityDisplay(deletingBuyOrder.commodityTicker) : ''
          }}</strong>
          at
          <strong>{{
            deletingBuyOrder ? getLocationDisplay(deletingBuyOrder.locationId) : ''
          }}</strong
          >?
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteBuyDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deletingBuy" @click="deleteBuyOrder"> Delete </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Delete Invoice Confirmation -->
    <v-dialog v-model="deleteInvoiceDialog" max-width="400">
      <v-card>
        <v-card-title>Delete Draft Invoice</v-card-title>
        <v-card-text>
          Are you sure you want to delete this draft invoice with
          <strong>{{ deletingInvoice?.counterpartyName }}</strong
          >?
          <span v-if="deletingInvoice && deletingInvoice.itemCount > 0">
            This will remove {{ deletingInvoice.itemCount }} line item{{
              deletingInvoice.itemCount > 1 ? 's' : ''
            }}
            and release any reservations.
          </span>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="deleteInvoiceDialog = false">Cancel</v-btn>
          <v-btn color="error" :loading="deletingInvoiceLoading" @click="deleteInvoice">
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Invoice Detail Dialog -->
    <InvoiceDetailDialog
      v-model="invoiceDetailDialog"
      :invoice="selectedInvoice"
      @updated="refreshInvoice"
    />
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useUrlTab, useOrderDeepLink } from '../composables'
import {
  PERMISSIONS,
  type SellOrderLimitMode,
  type OrderType,
  type InvoiceStatus,
  type InvoiceSummary,
  type Invoice,
  type Commodity,
} from '@kawakawa/types'
import { api, type SellOrderResponse, type BuyOrderResponse } from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { useUserStore } from '../stores/user'
import OrderDialog from '../components/OrderDialog.vue'
import OrderDetailDialog from '../components/OrderDetailDialog.vue'
import SellOrderEditDialog from '../components/SellOrderEditDialog.vue'
import BuyOrderEditDialog from '../components/BuyOrderEditDialog.vue'
import OrderTypeChip from '../components/OrderTypeChip.vue'
import CommodityDisplay from '../components/CommodityDisplay.vue'
import CommodityIcon from '../components/CommodityIcon.vue'
import InvoiceDetailDialog from '../components/invoices/InvoiceDetailDialog.vue'
import InvoiceStatusChip from '../components/invoices/InvoiceStatusChip.vue'
import InvoiceExpandedRow from '../components/invoices/InvoiceExpandedRow.vue'
import TokenSearchInput, {
  type SearchChip,
  type HelpToken,
} from '../components/TokenSearchInput.vue'
import { useSettingsStore } from '../stores/settings'

const userStore = useUserStore()
const settingsStore = useSettingsStore()
const route = useRoute()
const router = useRouter()

// Check if icons are enabled for dynamic row height
const hasIcons = computed(() => settingsStore.commodityIconStyle.value !== 'none')

// Display helpers that respect user preferences
const getLocationDisplay = (locationId: string): string => {
  return locationService.getLocationDisplay(locationId, userStore.getLocationDisplayMode())
}

const getCommodityDisplay = (ticker: string): string => {
  return commodityService.getCommodityDisplay(ticker, userStore.getCommodityDisplayMode())
}

const getCommodityObj = (ticker: string): Commodity => {
  const category = commodityService.getCommodityCategory(ticker)
  return {
    ticker,
    name: commodityService.getCommodityDisplay(ticker, 'name-only'),
    ...(category !== null && { category }),
  }
}

const ORDERS_TABS = ['buy', 'sell', 'invoices'] as const
const activeTab = useUrlTab({
  validTabs: ORDERS_TABS,
  defaultTab: 'buy',
})

const sellHeaders = [
  { title: 'Commodity', key: 'commodityTicker', sortable: true },
  { title: 'Location', key: 'locationId', sortable: true },
  { title: 'Unit Price', key: 'price', sortable: true },
  { title: 'Available', key: 'availableQuantity', sortable: true, align: 'end' as const },
  {
    title: 'Reservations',
    key: 'activeReservationCount',
    sortable: true,
    align: 'center' as const,
  },
  { title: 'Type', key: 'orderType', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, width: 120 },
]

const buyHeaders = [
  { title: 'Commodity', key: 'commodityTicker', sortable: true },
  { title: 'Location', key: 'locationId', sortable: true },
  { title: 'Unit Price', key: 'price', sortable: true },
  { title: 'Quantity', key: 'quantity', sortable: true, align: 'end' as const },
  {
    title: 'Reservations',
    key: 'activeReservationCount',
    sortable: true,
    align: 'center' as const,
  },
  { title: 'Type', key: 'orderType', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, width: 120 },
]

const invoiceHeaders = [
  { title: '', key: 'data-table-expand', width: 40 },
  { title: 'Direction', key: 'direction', sortable: true, width: 100 },
  { title: 'User', key: 'counterpartyName', sortable: true },
  { title: 'Commodities', key: 'commodities', sortable: false },
  { title: 'Status', key: 'status', sortable: true },
  { title: 'Buy #', key: 'buyItemCount', sortable: true, align: 'center' as const, width: 80 },
  { title: 'Sell #', key: 'sellItemCount', sortable: true, align: 'center' as const, width: 80 },
  { title: 'Buying', key: 'buyTotals', sortable: false, align: 'end' as const },
  { title: 'Selling', key: 'sellTotals', sortable: false, align: 'end' as const },
  { title: 'Created', key: 'createdAt', sortable: true },
  { title: 'Updated', key: 'updatedAt', sortable: true },
  { title: 'Actions', key: 'actions', sortable: false, width: 200 },
]

const invoiceDirectionOptions = [
  { title: 'All', value: null },
  { title: 'Sent', value: 'sent' },
  { title: 'Received', value: 'received' },
]

const invoiceStatusOptions = [
  { title: 'Draft', value: 'draft' },
  { title: 'Pending', value: 'pending' },
  { title: 'Confirmed', value: 'confirmed' },
  { title: 'Fulfilled', value: 'fulfilled' },
  { title: 'Partially Fulfilled', value: 'partially_fulfilled' },
  { title: 'Cancelled', value: 'cancelled' },
]

const defaultStatusFilter: InvoiceStatus[] = [
  'draft',
  'pending',
  'confirmed',
  'partially_fulfilled',
]

const allStatuses: InvoiceStatus[] = invoiceStatusOptions.map(o => o.value) as InvoiceStatus[]

// Sell orders state
const sellOrders = ref<SellOrderResponse[]>([])
const loadingSell = ref(false)
const sellSearch = ref('')

// Buy orders state
const buyOrders = ref<BuyOrderResponse[]>([])
const loadingBuy = ref(false)
const buySearch = ref('')
const orderDialog = ref(false)
const orderDialogTab = ref<'buy' | 'sell'>('buy')

// Invoices state
const invoices = ref<InvoiceSummary[]>([])
const loadingInvoices = ref(false)
const invoiceSearchChips = ref<SearchChip[]>([])
const invoiceStatusFilter = ref<InvoiceStatus[]>([...defaultStatusFilter])
const invoiceDirectionFilter = ref<'sent' | 'received' | null>(null)
const invoiceDetailDialog = ref(false)
const selectedInvoice = ref<Invoice | null>(null)
const expandedInvoices = ref<string[]>([])
const invoiceActionLoading = ref<string | null>(null)
const invoiceRefreshKey = ref(0)

// Order detail dialog with deep linking
const {
  dialogOpen: orderDetailDialog,
  orderType: orderDetailType,
  orderId: orderDetailId,
  openOrder,
} = useOrderDeepLink()

// Edit sell order state
const editSellDialog = ref(false)
const editingSellOrder = ref<SellOrderResponse | null>(null)

// Edit buy order state
const editBuyDialog = ref(false)
const editingBuyOrder = ref<BuyOrderResponse | null>(null)

// Delete state
const deleteSellDialog = ref(false)
const deletingSellOrder = ref<SellOrderResponse | null>(null)
const deletingSell = ref(false)

const deleteBuyDialog = ref(false)
const deletingBuyOrder = ref<BuyOrderResponse | null>(null)
const deletingBuy = ref(false)

// Delete invoice state
const deleteInvoiceDialog = ref(false)
const deletingInvoice = ref<InvoiceSummary | null>(null)
const deletingInvoiceLoading = ref(false)

const snackbar = ref({
  show: false,
  message: '',
  color: 'success',
})

// Check permissions for order creation
const canCreateInternalOrders = computed(() =>
  userStore.hasPermission(PERMISSIONS.ORDERS_POST_INTERNAL)
)
const canCreatePartnerOrders = computed(() =>
  userStore.hasPermission(PERMISSIONS.ORDERS_POST_PARTNER)
)

const orderTypes = computed(() => {
  const types: { title: string; value: OrderType }[] = []
  if (canCreateInternalOrders.value) {
    types.push({ title: 'Internal (members only)', value: 'internal' })
  }
  if (canCreatePartnerOrders.value) {
    types.push({ title: 'Partner (trade partners)', value: 'partner' })
  }
  return types
})

// Check if user can create any orders at all
const canCreateAnyOrders = computed(() => orderTypes.value.length > 0)

const showSnackbar = (message: string, color: 'success' | 'error' = 'success') => {
  snackbar.value = { show: true, message, color }
}

const filteredSellOrders = computed(() => {
  if (!sellSearch.value) return sellOrders.value
  const searchLower = sellSearch.value.toLowerCase()
  return sellOrders.value.filter(
    order =>
      order.commodityTicker.toLowerCase().includes(searchLower) ||
      order.locationId.toLowerCase().includes(searchLower)
  )
})

const filteredBuyOrders = computed(() => {
  if (!buySearch.value) return buyOrders.value
  const searchLower = buySearch.value.toLowerCase()
  return buyOrders.value.filter(
    order =>
      order.commodityTicker.toLowerCase().includes(searchLower) ||
      order.locationId.toLowerCase().includes(searchLower)
  )
})

// Helper for TokenSearchInput - get localized commodity name for search matching
const getCommodityName = (ticker: string): string => {
  return commodityService.getCommodityDisplay(ticker, 'name-only')
}

// Available user names for TokenSearchInput autocomplete
const availableInvoiceUserNames = computed(() => {
  const names = new Set<string>()
  for (const inv of invoices.value) {
    names.add(inv.counterpartyName)
  }
  return Array.from(names).sort()
})

const invoiceHelpTokens: HelpToken[] = [
  {
    label: 'User',
    color: 'info',
    example: 'alice',
    description: 'Counterparty username. Prefix with `user:` to force a user match.',
  },
  {
    label: 'Commodity',
    color: 'primary',
    example: 'COF',
    description: 'Ticker or material name — matches invoices containing that commodity.',
  },
  {
    label: 'Location',
    color: 'secondary',
    example: 'Montem',
    description: 'Planet or station — matches invoices tied to that location.',
  },
]

const filteredInvoices = computed(() => {
  let result = invoices.value

  // Filter by direction
  if (invoiceDirectionFilter.value) {
    result = result.filter(inv => inv.direction === invoiceDirectionFilter.value)
  }

  // Filter by status (multi-select: empty array = show all)
  if (invoiceStatusFilter.value.length > 0) {
    result = result.filter(inv => invoiceStatusFilter.value.includes(inv.status))
  }

  // Filter by search chips
  if (invoiceSearchChips.value.length > 0) {
    const userChips = invoiceSearchChips.value.filter(c => c.type === 'user')
    const commodityChips = invoiceSearchChips.value.filter(c => c.type === 'commodity')

    result = result.filter(inv => {
      // All user chips must match (AND logic)
      const matchesUsers = userChips.every(
        chip => inv.counterpartyName.toLowerCase() === chip.value.toLowerCase()
      )

      // All commodity chips must be present in the invoice (AND logic)
      const matchesCommodities = commodityChips.every(chip =>
        inv.commodityTickers.some(ticker => ticker.toLowerCase() === chip.value.toLowerCase())
      )

      return matchesUsers && matchesCommodities
    })
  }

  return result
})

// Show all / hide completed toggle for status filter
const isShowingAll = computed(
  () =>
    invoiceStatusFilter.value.length === 0 ||
    invoiceStatusFilter.value.length === allStatuses.length
)

const toggleShowAllStatuses = () => {
  if (isShowingAll.value) {
    invoiceStatusFilter.value = [...defaultStatusFilter]
  } else {
    invoiceStatusFilter.value = []
  }
}

// Helper to check if an invoice is still active (not completed)
const isActiveStatus = (status: string) => status !== 'fulfilled' && status !== 'cancelled'

const activeInvoicesCount = computed(() => {
  return invoices.value.filter(inv => isActiveStatus(inv.status)).length
})

// Calculate invoice summary totals from API-provided buy/sell breakdowns
// For received invoices, invert the buy/sell since they're from sender's perspective
type CurrencyTotals = Record<string, number>

const invoiceSummary = computed(() => {
  const activeInvoices = invoices.value.filter(inv => isActiveStatus(inv.status))

  let totalItems = 0
  const buyTotals: CurrencyTotals = {}
  const sellTotals: CurrencyTotals = {}
  const netTotals: CurrencyTotals = {}

  for (const inv of activeInvoices) {
    totalItems += inv.itemCount

    // Use helper functions to get the correct totals based on direction
    const myBuyTotals =
      inv.direction === 'sent' ? inv.buyTotalsByCurrency : inv.sellTotalsByCurrency
    const mySellTotals =
      inv.direction === 'sent' ? inv.sellTotalsByCurrency : inv.buyTotalsByCurrency

    for (const total of myBuyTotals) {
      buyTotals[total.currency] = (buyTotals[total.currency] ?? 0) + total.total
    }

    for (const total of mySellTotals) {
      sellTotals[total.currency] = (sellTotals[total.currency] ?? 0) + total.total
    }
  }

  // Calculate net totals (sell - buy = positive means receiving money)
  const allCurrencies = new Set([...Object.keys(buyTotals), ...Object.keys(sellTotals)])
  for (const currency of allCurrencies) {
    const buyAmount = buyTotals[currency] ?? 0
    const sellAmount = sellTotals[currency] ?? 0
    netTotals[currency] = sellAmount - buyAmount
  }

  return {
    totalItems,
    buyTotals,
    sellTotals,
    netTotals,
  }
})

const formatPrice = (price: number): string => {
  return price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

const formatFuzzyTime = (isoString: string): string => {
  const date = new Date(isoString)
  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHr = Math.floor(diffMin / 60)

  if (diffMs < 0) return 'just now'
  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHr < 24) return `${diffHr}h ago`

  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: date.getFullYear() !== new Date().getFullYear() ? 'numeric' : undefined,
  })
}

const formatFullDate = (isoString: string): string => {
  return new Date(isoString).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// Get what the current user is buying from this invoice
// For sent invoices: use buyTotalsByCurrency (items from sell orders = I'm buying)
// For received invoices: use sellTotalsByCurrency (sender's sell = my buy)
const getMyBuyTotals = (inv: InvoiceSummary) => {
  if (inv.direction === 'sent') {
    return inv.buyTotalsByCurrency
  }
  // Received: sender's sell (from buy orders) = my buy
  return inv.sellTotalsByCurrency
}

// Get what the current user is selling from this invoice
// For sent invoices: use sellTotalsByCurrency (items from buy orders = I'm selling)
// For received invoices: use buyTotalsByCurrency (sender's buy = my sell)
const getMySellTotals = (inv: InvoiceSummary) => {
  if (inv.direction === 'sent') {
    return inv.sellTotalsByCurrency
  }
  // Received: sender's buy (from sell orders) = my sell
  return inv.buyTotalsByCurrency
}

// Get the buy item count for the current user
// For sent invoices: buyItemCount (from sell orders = I'm buying)
// For received invoices: sellItemCount (sender's sell = my buy)
const getMyBuyItemCount = (inv: InvoiceSummary) => {
  if (inv.direction === 'sent') {
    return inv.buyItemCount
  }
  return inv.sellItemCount
}

// Get the sell item count for the current user
// For sent invoices: sellItemCount (from buy orders = I'm selling)
// For received invoices: buyItemCount (sender's buy = my sell)
const getMySellItemCount = (inv: InvoiceSummary) => {
  if (inv.direction === 'sent') {
    return inv.sellItemCount
  }
  return inv.buyItemCount
}

// Bulk action availability checks
const canConfirmAll = (inv: InvoiceSummary) => inv.status === 'pending'
const canRejectAll = (inv: InvoiceSummary) => inv.status === 'pending'
const canFulfillAll = (inv: InvoiceSummary) => inv.status === 'confirmed'

// Bulk action handlers
async function confirmAllReservations(inv: InvoiceSummary) {
  invoiceActionLoading.value = `confirm-${inv.id}`
  try {
    const fullInvoice = await api.invoices.get(inv.id)
    const pending = fullInvoice.lineItems.filter(
      item => item.reservationId && item.reservationStatus === 'pending'
    )
    await Promise.all(pending.map(item => api.reservations.confirm(item.reservationId!)))
    showSnackbar('All reservations confirmed')
    await loadInvoices()
  } catch (error) {
    console.error('Failed to confirm reservations', error)
    showSnackbar('Failed to confirm reservations', 'error')
  } finally {
    invoiceActionLoading.value = null
  }
}

async function rejectAllReservations(inv: InvoiceSummary) {
  invoiceActionLoading.value = `reject-${inv.id}`
  try {
    const fullInvoice = await api.invoices.get(inv.id)
    const pending = fullInvoice.lineItems.filter(
      item => item.reservationId && item.reservationStatus === 'pending'
    )
    await Promise.all(pending.map(item => api.reservations.reject(item.reservationId!)))
    showSnackbar('All reservations rejected')
    await loadInvoices()
  } catch (error) {
    console.error('Failed to reject reservations', error)
    showSnackbar('Failed to reject reservations', 'error')
  } finally {
    invoiceActionLoading.value = null
  }
}

async function fulfillAllReservations(inv: InvoiceSummary) {
  invoiceActionLoading.value = `fulfill-${inv.id}`
  try {
    const fullInvoice = await api.invoices.get(inv.id)
    const confirmed = fullInvoice.lineItems.filter(
      item => item.reservationId && item.reservationStatus === 'confirmed'
    )
    await Promise.all(confirmed.map(item => api.reservations.fulfill(item.reservationId!)))
    showSnackbar('All reservations fulfilled')
    await loadInvoices()
  } catch (error) {
    console.error('Failed to fulfill reservations', error)
    showSnackbar('Failed to fulfill reservations', 'error')
  } finally {
    invoiceActionLoading.value = null
  }
}

async function cancelInvoice(inv: InvoiceSummary) {
  invoiceActionLoading.value = `cancel-${inv.id}`
  try {
    await api.invoices.cancel(inv.id)
    showSnackbar('Invoice cancelled')
    await loadInvoices()
  } catch (error) {
    console.error('Failed to cancel invoice', error)
    showSnackbar('Failed to cancel invoice', 'error')
  } finally {
    invoiceActionLoading.value = null
  }
}

async function fulfillInvoice(inv: InvoiceSummary) {
  invoiceActionLoading.value = `fulfill-${inv.id}`
  try {
    await api.invoices.fulfill(inv.id)
    showSnackbar('Invoice fulfilled')
    // Collapse the fulfilled invoice row
    const idx = expandedInvoices.value.indexOf(String(inv.id))
    if (idx !== -1) expandedInvoices.value.splice(idx, 1)
    await loadInvoices()
  } catch (error) {
    console.error('Failed to fulfill invoice', error)
    showSnackbar('Failed to fulfill invoice', 'error')
  } finally {
    invoiceActionLoading.value = null
  }
}

// Toggle invoice row expansion
function toggleInvoiceExpand(_event: Event, { item }: { item: InvoiceSummary }) {
  const id = String(item.id)
  const index = expandedInvoices.value.indexOf(id)
  if (index === -1) {
    expandedInvoices.value.push(id)
  } else {
    expandedInvoices.value.splice(index, 1)
  }
}

// Row props for alternating row colors
const getInvoiceRowProps = ({ index }: { index: number }) => {
  return { class: index % 2 === 1 ? 'alt-row' : '' }
}

// Get the display price for a sell order - uses effectivePrice for dynamic pricing
const getSellOrderDisplayPrice = (item: SellOrderResponse): number | null => {
  if (item.pricingMode === 'dynamic') {
    return item.effectivePrice
  }
  return item.price > 0 ? item.price : null
}

// Get the display price for a buy order - uses effectivePrice for dynamic pricing
const getBuyOrderDisplayPrice = (item: BuyOrderResponse): number | null => {
  if (item.pricingMode === 'dynamic') {
    return item.effectivePrice
  }
  return item.price > 0 ? item.price : null
}

const getLimitModeLabel = (mode: SellOrderLimitMode): string => {
  switch (mode) {
    case 'max_sell':
      return 'Max sell'
    case 'reserve':
      return 'Reserve'
    default:
      return ''
  }
}

// Load functions
const loadSellOrders = async () => {
  try {
    loadingSell.value = true
    sellOrders.value = await api.sellOrders.list()
  } catch (error) {
    console.error('Failed to load sell orders', error)
    showSnackbar('Failed to load sell orders', 'error')
  } finally {
    loadingSell.value = false
  }
}

const loadBuyOrders = async () => {
  try {
    loadingBuy.value = true
    buyOrders.value = await api.buyOrders.list()
  } catch (error) {
    console.error('Failed to load buy orders', error)
    showSnackbar('Failed to load buy orders', 'error')
  } finally {
    loadingBuy.value = false
  }
}

const loadInvoices = async () => {
  try {
    loadingInvoices.value = true
    invoices.value = await api.invoices.list()
  } catch (error) {
    console.error('Failed to load invoices', error)
    showSnackbar('Failed to load invoices', 'error')
  } finally {
    loadingInvoices.value = false
    invoiceRefreshKey.value++
  }
}

const viewInvoice = async (summary: InvoiceSummary) => {
  await openInvoiceById(summary.id)
}

// Open invoice by ID (used for deep linking)
const openInvoiceById = async (invoiceId: number) => {
  try {
    selectedInvoice.value = await api.invoices.get(invoiceId)
    invoiceDetailDialog.value = true
    // Update URL with invoice param
    const query = { ...route.query, invoice: String(invoiceId) }
    router.replace({ query })
    // Switch to invoices tab
    activeTab.value = 'invoices'
  } catch (error) {
    console.error('Failed to load invoice', error)
    showSnackbar('Failed to load invoice details', 'error')
    // Clear the invalid invoice param from URL
    const query = { ...route.query }
    delete query.invoice
    router.replace({ query })
  }
}

// Clear invoice param from URL when dialog closes
watch(invoiceDetailDialog, isOpen => {
  if (!isOpen && route.query.invoice) {
    const query = { ...route.query }
    delete query.invoice
    router.replace({ query })
  }
})

// Watch for invoice deep link in URL
watch(
  () => route.query.invoice,
  async invoiceParam => {
    if (invoiceParam && !invoiceDetailDialog.value) {
      const invoiceId = parseInt(String(invoiceParam), 10)
      if (!isNaN(invoiceId)) {
        await openInvoiceById(invoiceId)
      }
    }
  },
  { immediate: true }
)

const refreshInvoice = async () => {
  if (!selectedInvoice.value) return
  try {
    selectedInvoice.value = await api.invoices.get(selectedInvoice.value.id)
    // Also refresh the invoice list in case status changed
    await loadInvoices()
  } catch (error) {
    console.error('Failed to refresh invoice', error)
  }
}

// Open order dialogs
const openBuyOrderDialog = () => {
  orderDialogTab.value = 'buy'
  orderDialog.value = true
}

const openSellOrderDialog = () => {
  orderDialogTab.value = 'sell'
  orderDialog.value = true
}

// View order functions
const viewSellOrder = (order: SellOrderResponse) => {
  openOrder('sell', order.id)
}

const viewBuyOrder = (order: BuyOrderResponse) => {
  openOrder('buy', order.id)
}

// Handler for OrderDialog creation
const onOrderCreated = async (type: 'buy' | 'sell') => {
  if (type === 'buy') {
    await loadBuyOrders()
  } else {
    await loadSellOrders()
  }
}

// Handlers for OrderDetailDialog events
const onOrderDeleted = async () => {
  if (orderDetailType.value === 'buy') {
    await loadBuyOrders()
  } else {
    await loadSellOrders()
  }
}

const onOrderUpdated = async () => {
  if (orderDetailType.value === 'buy') {
    await loadBuyOrders()
  } else {
    await loadSellOrders()
  }
}

// Edit sell order functions
const openEditSellDialog = (order: SellOrderResponse) => {
  editingSellOrder.value = order
  editSellDialog.value = true
}

const onSellOrderSaved = async () => {
  showSnackbar('Sell order updated successfully')
  await loadSellOrders()
}

// Edit buy order functions
const openEditBuyDialog = (order: BuyOrderResponse) => {
  editingBuyOrder.value = order
  editBuyDialog.value = true
}

const onBuyOrderSaved = async () => {
  showSnackbar('Buy order updated successfully')
  await loadBuyOrders()
}

// Delete sell order functions
const confirmDeleteSell = (order: SellOrderResponse) => {
  deletingSellOrder.value = order
  deleteSellDialog.value = true
}

const deleteSellOrder = async () => {
  if (!deletingSellOrder.value) return

  try {
    deletingSell.value = true
    await api.sellOrders.delete(deletingSellOrder.value.id)
    showSnackbar('Sell order deleted successfully')
    deleteSellDialog.value = false
    await loadSellOrders()
  } catch (error) {
    console.error('Failed to delete sell order', error)
    const message = error instanceof Error ? error.message : 'Failed to delete sell order'
    showSnackbar(message, 'error')
  } finally {
    deletingSell.value = false
  }
}

// Delete buy order functions
const confirmDeleteBuy = (order: BuyOrderResponse) => {
  deletingBuyOrder.value = order
  deleteBuyDialog.value = true
}

const deleteBuyOrder = async () => {
  if (!deletingBuyOrder.value) return

  try {
    deletingBuy.value = true
    await api.buyOrders.delete(deletingBuyOrder.value.id)
    showSnackbar('Buy order deleted successfully')
    deleteBuyDialog.value = false
    await loadBuyOrders()
  } catch (error) {
    console.error('Failed to delete buy order', error)
    const message = error instanceof Error ? error.message : 'Failed to delete buy order'
    showSnackbar(message, 'error')
  } finally {
    deletingBuy.value = false
  }
}

// Delete invoice functions
const confirmDeleteInvoice = (invoice: InvoiceSummary) => {
  deletingInvoice.value = invoice
  deleteInvoiceDialog.value = true
}

const deleteInvoice = async () => {
  if (!deletingInvoice.value) return

  try {
    deletingInvoiceLoading.value = true
    await api.invoices.delete(deletingInvoice.value.id)
    showSnackbar('Draft invoice deleted successfully')
    deleteInvoiceDialog.value = false
    await loadInvoices()
  } catch (error) {
    console.error('Failed to delete invoice', error)
    const message = error instanceof Error ? error.message : 'Failed to delete invoice'
    showSnackbar(message, 'error')
  } finally {
    deletingInvoiceLoading.value = false
  }
}

onMounted(() => {
  loadSellOrders()
  loadBuyOrders()
  loadInvoices()
})
</script>

<style>
/* Unscoped: taller rows when icons are enabled */
.icon-rows tbody tr td {
  height: 64px !important;
}

/* Clickable rows for expanding */
.clickable-rows tbody tr:not(.expanded-row) {
  cursor: pointer;
}

.clickable-rows tbody tr:not(.expanded-row):hover {
  background-color: rgba(var(--v-theme-on-surface), 0.04);
}

/* Alternating row colors */
.alt-row {
  background-color: rgba(var(--v-theme-on-surface), 0.03) !important;
}

/* Commodity icon grid in invoice rows */
.commodity-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  max-width: 180px;
}

.commodity-grid-icon {
  width: 24px;
  height: 24px;
  border-radius: 3px;
  font-size: 7px;
}

.commodity-grid-more {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 3px;
  background: rgba(var(--v-theme-on-surface), 0.1);
  font-size: 10px;
  font-weight: 500;
  cursor: default;
}
</style>
