<template>
  <v-dialog
    v-model="dialog"
    max-width="1000"
    width="95%"
    :persistent="dialogBehavior.persistent.value"
    :no-click-animation="dialogBehavior.noClickAnimation"
  >
    <v-card>
      <v-card-title class="pb-0">
        <div class="d-flex align-center w-100">
          <v-tabs v-model="activeTab" color="primary" class="flex-grow-1">
            <v-tab value="buy" :disabled="!canShowBuyTab">
              <v-icon start>mdi-cart-plus</v-icon>
              Buy Order
            </v-tab>
            <v-tab value="sell" :disabled="!canShowSellTab">
              <v-icon start>mdi-tag</v-icon>
              Sell Order
            </v-tab>
          </v-tabs>
          <v-btn
            v-if="!inventoryItem"
            :variant="isBulkMode ? 'flat' : 'outlined'"
            :color="isBulkMode ? 'primary' : undefined"
            size="small"
            :prepend-icon="isBulkMode ? 'mdi-playlist-check' : 'mdi-playlist-plus'"
            @click="toggleBulkMode"
          >
            {{ isBulkMode ? 'Bulk Mode' : 'Switch to Bulk' }}
          </v-btn>
        </div>
      </v-card-title>

      <v-card-text class="pt-4">
        <!-- Error Alert -->
        <v-alert
          v-if="errorMessage"
          type="error"
          variant="tonal"
          class="mb-4"
          closable
          @click:close="errorMessage = ''"
        >
          {{ errorMessage }}
        </v-alert>

        <v-row>
          <!-- Left Column: Order Form -->
          <v-col cols="12" md="6">
            <v-tabs-window v-model="activeTab">
              <!-- Buy Order Tab -->
              <v-tabs-window-item value="buy">
                <v-form ref="buyFormRef" @submit.prevent="submitOrder">
                  <!-- Single mode: Commodity selector -->
                  <KeyValueAutocomplete
                    v-if="!isBulkMode"
                    ref="buyCommodityRef"
                    v-model="buyForm.commodityTicker"
                    :items="commodities"
                    :favorites="settingsStore.favoritedCommodities.value"
                    :show-icons="hasIcons"
                    label="Commodity"
                    :rules="[v => !!v || 'Commodity is required']"
                    :loading="loadingCommodities"
                    required
                    @update:favorites="
                      settingsStore.updateSetting('market.favoritedCommodities', $event)
                    "
                  />

                  <!-- Location (both modes) -->
                  <KeyValueAutocomplete
                    v-model="buyForm.locationId"
                    :items="locations"
                    :favorites="settingsStore.favoritedLocations.value"
                    label="Location"
                    :rules="[v => !!v || 'Location is required']"
                    :loading="loadingLocations"
                    required
                    @update:favorites="
                      settingsStore.updateSetting('market.favoritedLocations', $event)
                    "
                  />

                  <!-- Single mode: Quantity -->
                  <v-text-field
                    v-if="!isBulkMode"
                    v-model.number="buyForm.quantity"
                    label="Quantity"
                    type="number"
                    min="1"
                    :rules="[v => buyForm.isStanding || v > 0 || 'Quantity must be positive']"
                    :disabled="buyForm.isStanding"
                    :hint="buyForm.isStanding ? 'Standing order - unlimited quantity' : ''"
                    :persistent-hint="buyForm.isStanding"
                  />

                  <!-- Standing Order Toggle (both modes) -->
                  <v-checkbox
                    v-model="buyForm.isStanding"
                    label="Standing order (unlimited quantity)"
                    density="compact"
                    hide-details
                    class="mb-3"
                  >
                    <template #label>
                      <span>Standing order</span>
                      <v-tooltip location="top">
                        <template #activator="{ props: tooltipProps }">
                          <v-icon v-bind="tooltipProps" size="small" class="ml-1">
                            mdi-information-outline
                          </v-icon>
                        </template>
                        <span
                          >Always buying - no quantity limit. Sellers can sell any amount to
                          you.</span
                        >
                      </v-tooltip>
                    </template>
                  </v-checkbox>

                  <!-- Automatic Pricing Status & Visibility -->
                  <div class="d-flex align-center mb-3 text-body-2">
                    <span class="text-medium-emphasis">Automatic Pricing:</span>
                    <a
                      v-if="buyForm.usePriceList"
                      href="#"
                      tabindex="-1"
                      class="ml-2 font-weight-medium text-primary"
                      @click.prevent="toggleAutomaticPricing(false)"
                    >
                      ON
                    </a>
                    <a
                      v-else-if="canUseDynamicPricing"
                      href="#"
                      tabindex="-1"
                      class="ml-2 font-weight-medium text-primary"
                      @click.prevent="toggleAutomaticPricing(true)"
                    >
                      OFF
                    </a>
                    <span v-else class="ml-2 text-medium-emphasis">
                      OFF
                      <v-tooltip location="top">
                        <template #activator="{ props: tooltipProps }">
                          <v-icon v-bind="tooltipProps" size="small" color="warning" class="ml-1">
                            mdi-alert-circle-outline
                          </v-icon>
                        </template>
                        <span>Set a default price list in Account Settings to enable</span>
                      </v-tooltip>
                    </span>
                    <v-chip
                      v-if="buyForm.usePriceList"
                      size="x-small"
                      color="info"
                      variant="tonal"
                      class="ml-2"
                    >
                      {{ settingsStore.defaultPriceList.value }}
                    </v-chip>

                    <v-spacer />

                    <!-- Visibility selector -->
                    <v-menu v-if="orderTypes.length > 1" location="bottom end">
                      <template #activator="{ props: menuProps }">
                        <v-chip
                          v-bind="menuProps"
                          size="small"
                          variant="tonal"
                          :color="buyForm.orderType === 'partner' ? 'primary' : 'default'"
                          class="cursor-pointer"
                        >
                          <v-icon start size="small">
                            {{ buyForm.orderType === 'partner' ? 'mdi-account-group' : 'mdi-home' }}
                          </v-icon>
                          {{ buyForm.orderType === 'partner' ? 'Partner' : 'Internal' }}
                          <v-icon end size="small">mdi-menu-down</v-icon>
                        </v-chip>
                      </template>
                      <v-list density="compact">
                        <v-list-item
                          v-for="type in orderTypes"
                          :key="type.value"
                          :active="buyForm.orderType === type.value"
                          @click="buyForm.orderType = type.value"
                        >
                          <template #prepend>
                            <v-icon size="small">
                              {{ type.value === 'partner' ? 'mdi-account-group' : 'mdi-home' }}
                            </v-icon>
                          </template>
                          <v-list-item-title>{{ type.title }}</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-menu>
                    <v-chip
                      v-else
                      size="small"
                      variant="tonal"
                      :color="buyForm.orderType === 'partner' ? 'primary' : 'default'"
                    >
                      <v-icon start size="small">
                        {{ buyForm.orderType === 'partner' ? 'mdi-account-group' : 'mdi-home' }}
                      </v-icon>
                      {{ buyForm.orderType === 'partner' ? 'Partner' : 'Internal' }}
                    </v-chip>
                  </div>

                  <!-- Dynamic Pricing Display (when using price list) - single mode only -->
                  <PriceListDisplay
                    v-if="!isBulkMode && buyForm.usePriceList"
                    :loading="loadingSuggestedPrice"
                    :price="suggestedPrice"
                    :price-list-code="settingsStore.defaultPriceList.value ?? ''"
                    :requested-currency="buyForm.currency"
                    :fallback-location-display="
                      suggestedPrice?.locationId
                        ? getLocationDisplay(suggestedPrice.locationId)
                        : ''
                    "
                    :requested-location-display="
                      suggestedPrice?.requestedLocationId
                        ? getLocationDisplay(suggestedPrice.requestedLocationId)
                        : ''
                    "
                    class="mb-3"
                  />

                  <!-- Custom Price (when not using price list) - single mode only -->
                  <template v-if="!isBulkMode && !buyForm.usePriceList">
                    <v-row>
                      <v-col cols="8">
                        <v-text-field
                          v-model.number="buyForm.price"
                          label="Unit Price"
                          type="number"
                          min="0"
                          step="0.01"
                          :rules="[
                            v =>
                              remainingBuyOrderQuantity <= 0 || v > 0 || 'Price must be positive',
                          ]"
                          :required="remainingBuyOrderQuantity > 0"
                          :hint="
                            remainingBuyOrderQuantity <= 0
                              ? 'Not required - no order will be placed'
                              : ''
                          "
                          :persistent-hint="remainingBuyOrderQuantity <= 0"
                        />
                      </v-col>
                      <v-col cols="4">
                        <v-select v-model="buyForm.currency" :items="currencies" label="Currency" />
                      </v-col>
                    </v-row>

                    <!-- Price Suggestion (only when not using price list) -->
                    <div
                      v-if="suggestedPrice || loadingSuggestedPrice"
                      class="price-suggestion mb-3"
                    >
                      <div class="d-flex align-center text-caption">
                        <v-progress-circular
                          v-if="loadingSuggestedPrice"
                          indeterminate
                          size="14"
                          width="2"
                          class="mr-2"
                        />
                        <v-icon v-else size="small" class="mr-1" color="info">mdi-lightbulb</v-icon>
                        <template v-if="suggestedPrice">
                          <span class="text-medium-emphasis">Suggested price:</span>
                          <span class="font-weight-medium ml-1">
                            {{ suggestedPrice.finalPrice.toFixed(2) }} {{ suggestedPrice.currency }}
                          </span>
                          <!-- Currency mismatch indicator -->
                          <v-tooltip
                            v-if="suggestedPrice.currency !== buyForm.currency"
                            location="top"
                          >
                            <template #activator="{ props: tooltipProps }">
                              <v-icon
                                v-bind="tooltipProps"
                                size="small"
                                color="warning"
                                class="ml-1"
                              >
                                mdi-swap-horizontal
                              </v-icon>
                            </template>
                            <span
                              >Price is in {{ suggestedPrice.currency }} (will update currency when
                              used)</span
                            >
                          </v-tooltip>
                          <!-- Fallback location indicator -->
                          <v-tooltip v-if="suggestedPrice.isFallback" location="top">
                            <template #activator="{ props: tooltipProps }">
                              <v-icon
                                v-bind="tooltipProps"
                                size="small"
                                color="warning"
                                class="ml-1"
                              >
                                mdi-map-marker-question
                              </v-icon>
                            </template>
                            <span
                              >No price at
                              {{ getLocationDisplay(suggestedPrice.requestedLocationId || '') }},
                              using default location
                              {{ getLocationDisplay(suggestedPrice.locationId) }}</span
                            >
                          </v-tooltip>
                          <v-btn
                            variant="text"
                            size="x-small"
                            color="primary"
                            class="ml-2"
                            @click="useSuggestedPrice"
                          >
                            Use
                          </v-btn>
                        </template>
                        <span v-else-if="loadingSuggestedPrice" class="text-medium-emphasis">
                          Loading suggested price...
                        </span>
                      </div>
                    </div>
                  </template>

                  <!-- Bulk mode: Price (when not using price list) -->
                  <template v-if="isBulkMode && !buyForm.usePriceList">
                    <v-row>
                      <v-col cols="8">
                        <v-text-field
                          v-model.number="buyForm.price"
                          label="Unit Price (all items)"
                          type="number"
                          min="0"
                          step="0.01"
                          :rules="[v => v > 0 || 'Price must be positive']"
                          required
                        />
                      </v-col>
                      <v-col cols="4">
                        <v-select v-model="buyForm.currency" :items="currencies" label="Currency" />
                      </v-col>
                    </v-row>
                  </template>

                  <!-- Total Value for Buy Order (single mode) -->
                  <v-alert
                    v-if="!isBulkMode && buyOrderTotalValue !== null"
                    color="warning"
                    variant="tonal"
                    density="compact"
                    class="mt-4"
                  >
                    <div class="d-flex justify-space-between align-center">
                      <span class="text-body-1">Total Value</span>
                      <span class="text-h6 font-weight-bold">
                        {{
                          buyOrderTotalValue.toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })
                        }}
                        {{ buyForm.usePriceList ? suggestedPrice?.currency : buyForm.currency }}
                      </span>
                    </div>
                  </v-alert>
                </v-form>
              </v-tabs-window-item>

              <!-- Sell Order Tab -->
              <v-tabs-window-item value="sell">
                <v-form ref="sellFormRef" @submit.prevent="submitOrder">
                  <!-- Item Info (when inventoryItem provided) -->
                  <v-alert
                    v-if="inventoryItem"
                    type="info"
                    variant="tonal"
                    class="mb-4"
                    density="compact"
                  >
                    <div>
                      <strong>{{ getCommodityDisplay(inventoryItem.commodityTicker) }}</strong>
                    </div>
                    <div class="text-caption">
                      {{ getLocationDisplay(inventoryItem.locationId) }}
                      &bull; {{ formatStorageType(inventoryItem.storageType) }} &bull;
                      {{ inventoryItem.quantity?.toLocaleString() }} available
                    </div>
                  </v-alert>

                  <!-- Commodity/Location (when no inventoryItem) -->
                  <template v-if="!inventoryItem">
                    <!-- Single mode: Commodity selector -->
                    <KeyValueAutocomplete
                      v-if="!isBulkMode"
                      ref="sellCommodityRef"
                      v-model="sellForm.commodityTicker"
                      :items="commodities"
                      :favorites="settingsStore.favoritedCommodities.value"
                      :show-icons="hasIcons"
                      label="Commodity"
                      :rules="[v => !!v || 'Commodity is required']"
                      :loading="loadingCommodities"
                      required
                      @update:favorites="
                        settingsStore.updateSetting('market.favoritedCommodities', $event)
                      "
                    />

                    <!-- Location (both modes) -->
                    <KeyValueAutocomplete
                      v-model="sellForm.locationId"
                      :items="locations"
                      :favorites="settingsStore.favoritedLocations.value"
                      label="Location"
                      :rules="[v => !!v || 'Location is required']"
                      :loading="loadingLocations"
                      required
                      @update:favorites="
                        settingsStore.updateSetting('market.favoritedLocations', $event)
                      "
                    />
                  </template>

                  <!-- Existing order alert (single mode only) -->
                  <v-alert
                    v-if="!isBulkMode && existingSellOrder"
                    type="warning"
                    variant="tonal"
                    class="mb-4"
                    density="compact"
                  >
                    <div class="font-weight-medium">Order already exists</div>
                    <div class="text-caption">
                      You have a sell order for this commodity at this location in
                      {{ existingSellOrder.currency }}. Use the Edit button to modify it.
                    </div>
                  </v-alert>

                  <!-- Automatic Pricing Status & Visibility -->
                  <div class="d-flex align-center mb-3 text-body-2">
                    <span class="text-medium-emphasis">Automatic Pricing:</span>
                    <a
                      v-if="sellForm.usePriceList"
                      href="#"
                      tabindex="-1"
                      class="ml-2 font-weight-medium text-primary"
                      @click.prevent="toggleAutomaticPricing(false)"
                    >
                      ON
                    </a>
                    <a
                      v-else-if="canUseDynamicPricing"
                      href="#"
                      tabindex="-1"
                      class="ml-2 font-weight-medium text-primary"
                      @click.prevent="toggleAutomaticPricing(true)"
                    >
                      OFF
                    </a>
                    <span v-else class="ml-2 text-medium-emphasis">
                      OFF
                      <v-tooltip location="top">
                        <template #activator="{ props: tooltipProps }">
                          <v-icon v-bind="tooltipProps" size="small" color="warning" class="ml-1">
                            mdi-alert-circle-outline
                          </v-icon>
                        </template>
                        <span>Set a default price list in Account Settings to enable</span>
                      </v-tooltip>
                    </span>
                    <v-chip
                      v-if="sellForm.usePriceList"
                      size="x-small"
                      color="info"
                      variant="tonal"
                      class="ml-2"
                    >
                      {{ settingsStore.defaultPriceList.value }}
                    </v-chip>

                    <v-spacer />

                    <!-- Visibility selector -->
                    <v-menu v-if="orderTypes.length > 1" location="bottom end">
                      <template #activator="{ props: menuProps }">
                        <v-chip
                          v-bind="menuProps"
                          size="small"
                          variant="tonal"
                          :color="sellForm.orderType === 'partner' ? 'primary' : 'default'"
                          class="cursor-pointer"
                        >
                          <v-icon start size="small">
                            {{
                              sellForm.orderType === 'partner' ? 'mdi-account-group' : 'mdi-home'
                            }}
                          </v-icon>
                          {{ sellForm.orderType === 'partner' ? 'Partner' : 'Internal' }}
                          <v-icon end size="small">mdi-menu-down</v-icon>
                        </v-chip>
                      </template>
                      <v-list density="compact">
                        <v-list-item
                          v-for="type in orderTypes"
                          :key="type.value"
                          :active="sellForm.orderType === type.value"
                          @click="sellForm.orderType = type.value"
                        >
                          <template #prepend>
                            <v-icon size="small">
                              {{ type.value === 'partner' ? 'mdi-account-group' : 'mdi-home' }}
                            </v-icon>
                          </template>
                          <v-list-item-title>{{ type.title }}</v-list-item-title>
                        </v-list-item>
                      </v-list>
                    </v-menu>
                    <v-chip
                      v-else
                      size="small"
                      variant="tonal"
                      :color="sellForm.orderType === 'partner' ? 'primary' : 'default'"
                    >
                      <v-icon start size="small">
                        {{ sellForm.orderType === 'partner' ? 'mdi-account-group' : 'mdi-home' }}
                      </v-icon>
                      {{ sellForm.orderType === 'partner' ? 'Partner' : 'Internal' }}
                    </v-chip>
                  </div>

                  <!-- Dynamic Pricing Display (when using price list) - single mode only -->
                  <PriceListDisplay
                    v-if="!isBulkMode && sellForm.usePriceList"
                    :loading="loadingSuggestedPrice"
                    :price="suggestedPrice"
                    :price-list-code="settingsStore.defaultPriceList.value ?? ''"
                    :requested-currency="sellForm.currency"
                    :fallback-location-display="
                      suggestedPrice?.locationId
                        ? getLocationDisplay(suggestedPrice.locationId)
                        : ''
                    "
                    :requested-location-display="
                      suggestedPrice?.requestedLocationId
                        ? getLocationDisplay(suggestedPrice.requestedLocationId)
                        : ''
                    "
                    class="mb-3"
                  />

                  <!-- Custom Price (when not using price list) - single mode only -->
                  <template v-if="!isBulkMode && !sellForm.usePriceList">
                    <v-row>
                      <v-col cols="8">
                        <v-text-field
                          v-model.number="sellForm.price"
                          label="Unit Price"
                          type="number"
                          min="0"
                          step="0.01"
                          :rules="[v => v > 0 || 'Price must be positive']"
                          required
                        />
                      </v-col>
                      <v-col cols="4">
                        <v-select
                          v-model="sellForm.currency"
                          :items="currencies"
                          label="Currency"
                        />
                      </v-col>
                    </v-row>

                    <!-- Price Suggestion (only when not using price list) -->
                    <div
                      v-if="suggestedPrice || loadingSuggestedPrice"
                      class="price-suggestion mb-3"
                    >
                      <div class="d-flex align-center text-caption">
                        <v-progress-circular
                          v-if="loadingSuggestedPrice"
                          indeterminate
                          size="14"
                          width="2"
                          class="mr-2"
                        />
                        <v-icon v-else size="small" class="mr-1" color="info">mdi-lightbulb</v-icon>
                        <template v-if="suggestedPrice">
                          <span class="text-medium-emphasis">Suggested price:</span>
                          <span class="font-weight-medium ml-1">
                            {{ suggestedPrice.finalPrice.toFixed(2) }} {{ suggestedPrice.currency }}
                          </span>
                          <!-- Currency mismatch indicator -->
                          <v-tooltip
                            v-if="suggestedPrice.currency !== sellForm.currency"
                            location="top"
                          >
                            <template #activator="{ props: tooltipProps }">
                              <v-icon
                                v-bind="tooltipProps"
                                size="small"
                                color="warning"
                                class="ml-1"
                              >
                                mdi-swap-horizontal
                              </v-icon>
                            </template>
                            <span
                              >Price is in {{ suggestedPrice.currency }} (will update currency when
                              used)</span
                            >
                          </v-tooltip>
                          <!-- Fallback location indicator -->
                          <v-tooltip v-if="suggestedPrice.isFallback" location="top">
                            <template #activator="{ props: tooltipProps }">
                              <v-icon
                                v-bind="tooltipProps"
                                size="small"
                                color="warning"
                                class="ml-1"
                              >
                                mdi-map-marker-question
                              </v-icon>
                            </template>
                            <span
                              >No price at
                              {{ getLocationDisplay(suggestedPrice.requestedLocationId || '') }},
                              using default location
                              {{ getLocationDisplay(suggestedPrice.locationId) }}</span
                            >
                          </v-tooltip>
                          <v-btn
                            variant="text"
                            size="x-small"
                            color="primary"
                            class="ml-2"
                            @click="useSuggestedPrice"
                          >
                            Use
                          </v-btn>
                        </template>
                        <span v-else-if="loadingSuggestedPrice" class="text-medium-emphasis">
                          Loading suggested price...
                        </span>
                      </div>
                    </div>
                  </template>

                  <!-- Bulk mode: Price (when not using price list) -->
                  <template v-if="isBulkMode && !sellForm.usePriceList">
                    <v-row>
                      <v-col cols="8">
                        <v-text-field
                          v-model.number="sellForm.price"
                          label="Unit Price (all items)"
                          type="number"
                          min="0"
                          step="0.01"
                          :rules="[v => v > 0 || 'Price must be positive']"
                          required
                        />
                      </v-col>
                      <v-col cols="4">
                        <v-select
                          v-model="sellForm.currency"
                          :items="currencies"
                          label="Currency"
                        />
                      </v-col>
                    </v-row>
                  </template>

                  <!-- Limit Mode (single mode only) -->
                  <template v-if="!isBulkMode">
                    <v-select
                      v-model="sellForm.limitMode"
                      :items="limitModes"
                      item-title="title"
                      item-value="value"
                      label="Quantity Limit"
                      hint="Control how much of your inventory is available for sale"
                      persistent-hint
                    />

                    <!-- Limit Quantity (shown when not 'none') -->
                    <v-text-field
                      v-if="sellForm.limitMode !== 'none'"
                      v-model.number="sellForm.limitQuantity"
                      :label="
                        sellForm.limitMode === 'max_sell' ? 'Maximum to sell' : 'Reserve quantity'
                      "
                      type="number"
                      min="0"
                      :rules="[v => v >= 0 || 'Quantity must be non-negative']"
                      :hint="limitQuantityHint"
                      persistent-hint
                      class="mt-2"
                    />

                    <!-- Total Value for Sell Order with max_sell limit -->
                    <v-alert
                      v-if="sellOrderTotalValue !== null"
                      color="success"
                      variant="tonal"
                      density="compact"
                      class="mt-4"
                    >
                      <div class="d-flex justify-space-between align-center">
                        <span class="text-body-1">Total Value</span>
                        <span class="text-h6 font-weight-bold">
                          {{
                            sellOrderTotalValue.toLocaleString(undefined, {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })
                          }}
                          {{ sellForm.usePriceList ? suggestedPrice?.currency : sellForm.currency }}
                        </span>
                      </div>
                    </v-alert>
                  </template>

                  <!-- Bulk mode: Limit mode selector -->
                  <template v-if="isBulkMode">
                    <v-select
                      v-model="sellForm.limitMode"
                      :items="limitModes"
                      item-title="title"
                      item-value="value"
                      label="Quantity Limit (all items)"
                      hint="Applied to all selected commodities"
                      persistent-hint
                    />
                  </template>
                </v-form>
              </v-tabs-window-item>
            </v-tabs-window>
          </v-col>

          <!-- Right Column: Matching Orders (single mode) or Commodity List (bulk mode) -->
          <v-col cols="12" md="6">
            <!-- Bulk Mode: Commodity Selection -->
            <BulkCommodityList
              v-if="isBulkMode"
              ref="bulkCommodityListRef"
              :is-standing="activeTab === 'buy' ? buyForm.isStanding : false"
              :default-quantity="100"
              :list-height="350"
              @update:selections="bulkSelections = $event"
            />

            <!-- Single Mode: Matching Orders -->
            <MatchingOrdersList
              v-else
              ref="matchingOrdersListRef"
              :mode="activeTab"
              :commodity-ticker="currentCommodity"
              :location-id="currentLocation"
              :currency="currentCurrency"
              :order-quantity="activeTab === 'buy' ? buyForm.quantity : sellForm.limitQuantity || 0"
              @update:reservations="reservations = $event"
            />
          </v-col>
        </v-row>
      </v-card-text>

      <v-card-actions>
        <v-btn variant="text" color="secondary" @click="clearForm">Clear</v-btn>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>

        <!-- Bulk mode buttons -->
        <template v-if="isBulkMode">
          <v-btn
            :color="activeTab === 'buy' ? 'warning' : 'success'"
            :loading="saving"
            :disabled="bulkSelections.length === 0 || !currentLocation"
            @click="submitBulkOrder"
          >
            Create {{ bulkSelections.length }} {{ activeTab === 'buy' ? 'Buy' : 'Sell' }} Order{{
              bulkSelections.length === 1 ? '' : 's'
            }}
          </v-btn>
        </template>

        <!-- Single mode buttons -->
        <template v-else>
          <v-btn v-if="activeTab === 'buy'" color="warning" :loading="saving" @click="submitOrder">
            {{ totalReservationQuantity > 0 ? 'Create & Reserve' : 'Create Buy Order' }}
          </v-btn>
          <template v-else>
            <!-- Show Edit button if existing order matches, Create button otherwise -->
            <v-btn
              v-if="existingSellOrder"
              color="primary"
              prepend-icon="mdi-pencil"
              @click="editExistingOrder"
            >
              Edit Existing Order
            </v-btn>
            <v-btn v-else color="success" :loading="saving" @click="submitOrder">
              {{ totalReservationQuantity > 0 ? 'Create & Fill' : 'Create Sell Order' }}
            </v-btn>
          </template>
        </template>
      </v-card-actions>
    </v-card>

    <!-- Bulk Results Dialog -->
    <v-dialog v-model="bulkResultsDialog" max-width="500">
      <v-card>
        <v-card-title>Bulk Order Results</v-card-title>
        <v-card-text>
          <v-alert v-if="bulkResults.created > 0" type="success" variant="tonal" class="mb-2">
            Created {{ bulkResults.created }} order{{ bulkResults.created === 1 ? '' : 's' }}
          </v-alert>
          <v-alert v-if="bulkResults.skipped > 0" type="warning" variant="tonal" class="mb-2">
            Skipped {{ bulkResults.skipped }} (already exist)
          </v-alert>
          <v-alert v-if="bulkResults.failed > 0" type="error" variant="tonal">
            Failed {{ bulkResults.failed }}
            <div v-if="bulkResults.errors.length > 0" class="text-caption mt-1">
              <div v-for="(err, i) in bulkResults.errors.slice(0, 5)" :key="i">{{ err }}</div>
              <div v-if="bulkResults.errors.length > 5">
                ...and {{ bulkResults.errors.length - 5 }} more
              </div>
            </div>
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn color="primary" @click="closeBulkResults">Done</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

import {
  PERMISSIONS,
  type Currency,
  type SellOrderLimitMode,
  type OrderType,
} from '@kawakawa/types'
import {
  api,
  type FioInventoryItem,
  type EffectivePrice,
  type SellOrderResponse,
} from '../services/api'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { formatStorageType } from '../utils/locationUtils'
import { useUserStore } from '../stores/user'
import { useSettingsStore } from '../stores/settings'
import { useDisplayHelpers, useDialogBehavior } from '../composables'
import KeyValueAutocomplete, { type KeyValueItem } from './KeyValueAutocomplete.vue'
import PriceListDisplay from './PriceListDisplay.vue'
import MatchingOrdersList from './MatchingOrdersList.vue'
import BulkCommodityList, { type BulkCommoditySelection } from './BulkCommodityList.vue'

type OrderTab = 'buy' | 'sell'

const props = withDefaults(
  defineProps<{
    modelValue: boolean
    initialTab?: OrderTab
    inventoryItem?: FioInventoryItem | null
    initialCommodity?: string
    initialLocation?: string
  }>(),
  {
    initialTab: 'buy',
    inventoryItem: null,
    initialCommodity: undefined,
    initialLocation: undefined,
  }
)

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'created', type: OrderTab): void
  (e: 'edit', orderType: 'sell' | 'buy', orderId: number): void
}>()

const userStore = useUserStore()
const settingsStore = useSettingsStore()
const { getLocationDisplay, getCommodityDisplay } = useDisplayHelpers()

const dialog = computed({
  get: () => props.modelValue,
  set: value => emit('update:modelValue', value),
})

const dialogBehavior = useDialogBehavior({ modelValue: dialog })

const activeTab = ref<OrderTab>(props.initialTab)
const isBulkMode = ref(false)

// Form refs
const buyFormRef = ref()
const sellFormRef = ref()
const buyCommodityRef = ref<{ focus: () => void } | null>(null)
const sellCommodityRef = ref<{ focus: () => void } | null>(null)
const matchingOrdersListRef = ref<InstanceType<typeof MatchingOrdersList> | null>(null)
const bulkCommodityListRef = ref<InstanceType<typeof BulkCommodityList> | null>(null)
const saving = ref(false)
const errorMessage = ref('')

// Loading states
const loadingCommodities = ref(false)
const loadingLocations = ref(false)
const loadingSuggestedPrice = ref(false)
const loadingExistingOrders = ref(false)

// Price suggestion
const suggestedPrice = ref<EffectivePrice | null>(null)

// User's existing sell orders (for checking duplicates)
const existingSellOrders = ref<SellOrderResponse[]>([])

// Reservations from MatchingOrdersList
const reservations = ref<Array<{ orderId: number; quantity: number; expiresAt?: string }>>([])

// Bulk mode selections
const bulkSelections = ref<BulkCommoditySelection[]>([])

// Bulk results
const bulkResultsDialog = ref(false)
const bulkResults = ref({ created: 0, skipped: 0, failed: 0, errors: [] as string[] })

// Constants
const currencies: Currency[] = ['ICA', 'CIS', 'AIC', 'NCC']

const limitModes = [
  { title: 'No limit (sell all available)', value: 'none' },
  { title: 'Maximum to sell', value: 'max_sell' },
  { title: 'Reserve quantity (keep minimum)', value: 'reserve' },
]

// Tab visibility
const canShowBuyTab = computed(() => !props.inventoryItem)
const canShowSellTab = computed(() => true)

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

// Default order type based on available options
const defaultOrderType = computed((): OrderType => {
  if (orderTypes.value.length === 0) return 'internal'
  return orderTypes.value[0].value
})

// Buy form
const buyForm = ref({
  commodityTicker: '',
  locationId: '',
  quantity: 1,
  price: 0,
  currency: userStore.getPreferredCurrency(),
  orderType: 'internal' as OrderType,
  usePriceList: false,
  priceListCode: null as string | null,
  isStanding: false,
})

// Sell form
const sellForm = ref({
  commodityTicker: '',
  locationId: '',
  storageType: null as string | null, // null = all storage types, specific = only that storage
  price: 0,
  currency: userStore.getPreferredCurrency(),
  limitMode: 'none' as SellOrderLimitMode,
  limitQuantity: 0,
  orderType: 'internal' as OrderType,
  usePriceList: false,
  priceListCode: null as string | null,
})

// Check if user can use dynamic pricing (has a default price list configured)
const canUseDynamicPricing = computed(() => {
  return !!settingsStore.defaultPriceList.value
})

// Check if commodity icons should be shown
const hasIcons = computed(() => settingsStore.commodityIconStyle.value !== 'none')

// Current form's usePriceList state
const currentUsePriceList = computed(() => {
  return activeTab.value === 'buy' ? buyForm.value.usePriceList : sellForm.value.usePriceList
})

const limitQuantityHint = computed(() => {
  if (sellForm.value.limitMode === 'max_sell') {
    return `Will sell up to ${sellForm.value.limitQuantity} units`
  }
  if (sellForm.value.limitMode === 'reserve') {
    return `Will keep at least ${sellForm.value.limitQuantity} units in reserve`
  }
  return ''
})

// Commodity and location options
const commodities = ref<KeyValueItem[]>([])
const locations = ref<KeyValueItem[]>([])

// Computed properties
const currentCommodity = computed(() => {
  if (activeTab.value === 'buy') {
    return buyForm.value.commodityTicker
  }
  return props.inventoryItem?.commodityTicker ?? sellForm.value.commodityTicker
})

const currentLocation = computed(() => {
  if (activeTab.value === 'buy') {
    return buyForm.value.locationId
  }
  return props.inventoryItem?.locationId ?? sellForm.value.locationId
})

const currentCurrency = computed(() => {
  if (activeTab.value === 'buy') {
    return buyForm.value.currency
  }
  return sellForm.value.currency
})

const totalReservationQuantity = computed(() => {
  return reservations.value.reduce((sum, r) => sum + r.quantity, 0)
})

// Calculate the remaining order quantity after reservations
const remainingBuyOrderQuantity = computed(() => {
  return Math.max(0, buyForm.value.quantity - totalReservationQuantity.value)
})

// Display price - uses price list price when enabled, otherwise manual price
const displayBuyPrice = computed((): number | null => {
  if (buyForm.value.usePriceList) {
    return suggestedPrice.value?.finalPrice ?? null
  }
  return buyForm.value.price > 0 ? buyForm.value.price : null
})

const displaySellPrice = computed((): number | null => {
  if (sellForm.value.usePriceList) {
    return suggestedPrice.value?.finalPrice ?? null
  }
  return sellForm.value.price > 0 ? sellForm.value.price : null
})

// Total value for buy orders (always have fixed quantity)
const buyOrderTotalValue = computed((): number | null => {
  if (!displayBuyPrice.value || !buyForm.value.quantity) return null
  return displayBuyPrice.value * buyForm.value.quantity
})

// Total value for sell orders with max_sell limit (fixed quantity)
const sellOrderTotalValue = computed((): number | null => {
  if (sellForm.value.limitMode !== 'max_sell') return null
  if (!displaySellPrice.value || !sellForm.value.limitQuantity) return null
  return displaySellPrice.value * sellForm.value.limitQuantity
})

// Check if an existing sell order matches the current form (commodity + location + storageType + currency + orderType)
const existingSellOrder = computed(() => {
  if (activeTab.value !== 'sell') return null

  const commodity = props.inventoryItem?.commodityTicker ?? sellForm.value.commodityTicker
  const location = props.inventoryItem?.locationId ?? sellForm.value.locationId
  const storageType = sellForm.value.storageType
  const currency = sellForm.value.currency
  const orderType = sellForm.value.orderType

  if (!commodity || !location || !currency) return null

  return existingSellOrders.value.find(
    order =>
      order.commodityTicker === commodity &&
      order.locationId === location &&
      order.storageType === storageType &&
      order.currency === currency &&
      order.orderType === orderType
  )
})

// Methods
const toggleBulkMode = () => {
  isBulkMode.value = !isBulkMode.value
  if (isBulkMode.value) {
    // Reset selections when entering bulk mode
    bulkSelections.value = []
  }
}

// Emit edit event so the parent can open the appropriate edit dialog in-place
const editExistingOrder = () => {
  if (!existingSellOrder.value) return
  dialog.value = false
  emit('edit', 'sell', existingSellOrder.value.id)
}

// Load suggested price from user's default price list
const loadSuggestedPrice = async () => {
  const commodity = currentCommodity.value
  const location = currentLocation.value
  const currency = currentCurrency.value
  const priceList = settingsStore.defaultPriceList.value

  if (!commodity || !location || !currency || !priceList) {
    suggestedPrice.value = null
    return
  }

  try {
    loadingSuggestedPrice.value = true
    const prices = await api.prices.getEffective(priceList, location, currency)
    const price = prices.find((p: EffectivePrice) => p.commodityTicker === commodity)
    suggestedPrice.value = price ?? null
  } catch {
    suggestedPrice.value = null
  } finally {
    loadingSuggestedPrice.value = false
  }
}

// Apply suggested price to the form
const useSuggestedPrice = () => {
  if (!suggestedPrice.value) return

  if (activeTab.value === 'buy') {
    buyForm.value.price = suggestedPrice.value.finalPrice
    buyForm.value.currency = suggestedPrice.value.currency
  } else {
    sellForm.value.price = suggestedPrice.value.finalPrice
    sellForm.value.currency = suggestedPrice.value.currency
  }
}

const loadCommodities = async () => {
  try {
    loadingCommodities.value = true
    const data = await commodityService.getAllCommodities()
    commodities.value = data.map(c => ({
      key: c.ticker,
      display: commodityService.getCommodityDisplay(c.ticker, userStore.getCommodityDisplayMode()),
      name: c.name,
      category: c.category,
    }))
  } catch (error) {
    console.error('Failed to load commodities', error)
    errorMessage.value = 'Failed to load commodities'
  } finally {
    loadingCommodities.value = false
  }
}

const loadLocations = async () => {
  try {
    loadingLocations.value = true
    const [data] = await Promise.all([
      locationService.getAllLocations(),
      locationService.loadUserLocations(),
    ])
    locations.value = data.map(l => ({
      key: l.id,
      display: locationService.getLocationDisplay(l.id, userStore.getLocationDisplayMode()),
      locationType: l.type,
      isUserLocation: locationService.isUserLocation(l.id),
      storageTypes: locationService.getStorageTypes(l.id),
    }))
  } catch (error) {
    console.error('Failed to load locations', error)
    errorMessage.value = 'Failed to load locations'
  } finally {
    loadingLocations.value = false
  }
}

// Load user's existing sell orders to check for duplicates
const loadExistingSellOrders = async () => {
  try {
    loadingExistingOrders.value = true
    existingSellOrders.value = await api.sellOrders.list()
  } catch (error) {
    console.error('Failed to load existing sell orders', error)
    existingSellOrders.value = []
  } finally {
    loadingExistingOrders.value = false
  }
}

// Get initial usePriceList value based on settings
const getInitialUsePriceList = (): boolean => {
  return canUseDynamicPricing.value && settingsStore.automaticPricing.value
}

const resetBuyForm = () => {
  const usePriceList = getInitialUsePriceList()
  buyForm.value = {
    commodityTicker: '',
    locationId: '',
    quantity: 1,
    price: usePriceList ? 0 : 0,
    currency: userStore.getPreferredCurrency(),
    orderType: defaultOrderType.value,
    usePriceList,
    priceListCode: usePriceList ? settingsStore.defaultPriceList.value : null,
    isStanding: false,
  }
}

const resetSellForm = () => {
  const usePriceList = getInitialUsePriceList()
  sellForm.value = {
    commodityTicker: props.inventoryItem?.commodityTicker ?? '',
    locationId: props.inventoryItem?.locationId ?? '',
    storageType: props.inventoryItem?.storageType ?? null, // Use inventory item's storage type if available
    price: usePriceList ? 0 : 0,
    currency: userStore.getPreferredCurrency(),
    limitMode: 'none',
    limitQuantity: 0,
    orderType: defaultOrderType.value,
    usePriceList,
    priceListCode: usePriceList ? settingsStore.defaultPriceList.value : null,
  }
}

// Toggle automatic pricing for current form and save setting
const toggleAutomaticPricing = async (enable: boolean) => {
  const priceListCode = enable ? settingsStore.defaultPriceList.value : null

  if (activeTab.value === 'buy') {
    buyForm.value.usePriceList = enable
    buyForm.value.priceListCode = priceListCode
    if (enable) {
      buyForm.value.price = 0
      if (suggestedPrice.value) {
        buyForm.value.currency = suggestedPrice.value.currency
      }
    }
  } else {
    sellForm.value.usePriceList = enable
    sellForm.value.priceListCode = priceListCode
    if (enable) {
      sellForm.value.price = 0
      if (suggestedPrice.value) {
        sellForm.value.currency = suggestedPrice.value.currency
      }
    }
  }

  await settingsStore.updateSetting('market.automaticPricing', enable)
}

const clearForm = () => {
  errorMessage.value = ''
  reservations.value = []
  bulkSelections.value = []
  suggestedPrice.value = null
  matchingOrdersListRef.value?.reset()
  bulkCommodityListRef.value?.reset()
  if (activeTab.value === 'buy') {
    resetBuyForm()
  } else {
    resetSellForm()
  }
}

const close = () => {
  dialog.value = false
  errorMessage.value = ''
  reservations.value = []
  bulkSelections.value = []
  suggestedPrice.value = null
  isBulkMode.value = false
  resetBuyForm()
  resetSellForm()
}

// Sync shared values between forms when switching tabs
const syncFormsOnTabChange = (newTab: OrderTab, oldTab: OrderTab) => {
  if (props.inventoryItem) return

  if (newTab === 'sell' && oldTab === 'buy') {
    sellForm.value.commodityTicker = buyForm.value.commodityTicker
    sellForm.value.locationId = buyForm.value.locationId
    sellForm.value.price = buyForm.value.price
    sellForm.value.currency = buyForm.value.currency
    sellForm.value.orderType = buyForm.value.orderType
    sellForm.value.usePriceList = buyForm.value.usePriceList
    sellForm.value.priceListCode = buyForm.value.priceListCode
  } else if (newTab === 'buy' && oldTab === 'sell') {
    buyForm.value.commodityTicker = sellForm.value.commodityTicker
    buyForm.value.locationId = sellForm.value.locationId
    buyForm.value.price = sellForm.value.price
    buyForm.value.currency = sellForm.value.currency
    buyForm.value.orderType = sellForm.value.orderType
    buyForm.value.usePriceList = sellForm.value.usePriceList
    buyForm.value.priceListCode = sellForm.value.priceListCode
  }
}

const submitOrder = async () => {
  errorMessage.value = ''

  const formRef = activeTab.value === 'buy' ? buyFormRef.value : sellFormRef.value
  const { valid } = await formRef.validate()
  if (!valid) return

  try {
    saving.value = true

    if (activeTab.value === 'buy') {
      // Only create buy order if there's remaining quantity after reservations (or if standing)
      if (buyForm.value.isStanding || remainingBuyOrderQuantity.value > 0) {
        await api.buyOrders.create({
          commodityTicker: buyForm.value.commodityTicker,
          locationId: buyForm.value.locationId,
          quantity: buyForm.value.isStanding ? 0 : remainingBuyOrderQuantity.value,
          price: buyForm.value.price,
          currency: buyForm.value.currency,
          orderType: buyForm.value.orderType,
          priceListCode: buyForm.value.priceListCode,
          isStanding: buyForm.value.isStanding,
        })
      }

      // Create reservations for selected sell orders
      for (const reservation of reservations.value) {
        await api.reservations.createForSellOrder({
          sellOrderId: reservation.orderId,
          quantity: reservation.quantity,
          expiresAt: reservation.expiresAt,
        })
      }
    } else {
      const commodityTicker = props.inventoryItem?.commodityTicker ?? sellForm.value.commodityTicker
      const locationId = props.inventoryItem?.locationId ?? sellForm.value.locationId

      if (!commodityTicker || !locationId) {
        errorMessage.value = 'Commodity and location are required'
        return
      }

      let adjustedLimitQuantity: number | null = null
      if (sellForm.value.limitMode === 'max_sell') {
        adjustedLimitQuantity = Math.max(
          0,
          (sellForm.value.limitQuantity || 0) - totalReservationQuantity.value
        )
      } else if (sellForm.value.limitMode === 'reserve') {
        adjustedLimitQuantity = sellForm.value.limitQuantity
      }

      await api.sellOrders.create({
        commodityTicker,
        locationId,
        storageType: sellForm.value.storageType,
        price: sellForm.value.price,
        currency: sellForm.value.currency,
        orderType: sellForm.value.orderType,
        limitMode: sellForm.value.limitMode,
        limitQuantity: adjustedLimitQuantity,
        priceListCode: sellForm.value.priceListCode,
      })

      // Create reservations for selected buy orders
      for (const reservation of reservations.value) {
        await api.reservations.createForBuyOrder({
          buyOrderId: reservation.orderId,
          quantity: reservation.quantity,
          expiresAt: reservation.expiresAt,
        })
      }
    }

    emit('created', activeTab.value)
    close()
  } catch (error) {
    console.error('Failed to create order', error)
    errorMessage.value = error instanceof Error ? error.message : 'Failed to create order'
  } finally {
    saving.value = false
  }
}

const submitBulkOrder = async () => {
  errorMessage.value = ''

  const locationId =
    activeTab.value === 'buy' ? buyForm.value.locationId : sellForm.value.locationId
  if (!locationId || bulkSelections.value.length === 0) return

  saving.value = true
  bulkResults.value = { created: 0, skipped: 0, failed: 0, errors: [] }

  const form = activeTab.value === 'buy' ? buyForm.value : sellForm.value
  const priceListCode = form.usePriceList ? settingsStore.defaultPriceList.value : null

  for (const selection of bulkSelections.value) {
    try {
      if (activeTab.value === 'buy') {
        await api.buyOrders.create({
          commodityTicker: selection.ticker,
          locationId,
          quantity: buyForm.value.isStanding ? 0 : selection.quantity,
          price: buyForm.value.usePriceList ? 0 : buyForm.value.price,
          currency: buyForm.value.currency,
          orderType: buyForm.value.orderType,
          priceListCode,
          isStanding: buyForm.value.isStanding,
        })
      } else {
        await api.sellOrders.create({
          commodityTicker: selection.ticker,
          locationId,
          price: sellForm.value.usePriceList ? 0 : sellForm.value.price,
          currency: sellForm.value.currency,
          orderType: sellForm.value.orderType,
          limitMode: sellForm.value.limitMode,
          limitQuantity: sellForm.value.limitMode === 'none' ? null : selection.quantity,
          priceListCode,
        })
      }
      bulkResults.value.created++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (message.includes('already exists')) {
        bulkResults.value.skipped++
      } else {
        bulkResults.value.failed++
        bulkResults.value.errors.push(`${selection.ticker}: ${message}`)
      }
    }
  }

  saving.value = false
  bulkResultsDialog.value = true
}

const closeBulkResults = () => {
  bulkResultsDialog.value = false
  if (bulkResults.value.created > 0) {
    emit('created', activeTab.value)
  }
  close()
}

// Watch for commodity/location/currency changes to load suggested price (single mode only)
watch(
  [currentCommodity, currentLocation, currentCurrency],
  () => {
    if (!isBulkMode.value) {
      loadSuggestedPrice()
    }
  },
  { immediate: false }
)

// Auto-fill price when a suggested price is loaded (only in custom pricing mode)
watch(suggestedPrice, newPrice => {
  if (!newPrice) return

  if (currentUsePriceList.value) {
    if (activeTab.value === 'buy') {
      buyForm.value.currency = newPrice.currency
    } else {
      sellForm.value.currency = newPrice.currency
    }
    return
  }

  if (!settingsStore.automaticPricing.value) return

  const currentPrice = activeTab.value === 'buy' ? buyForm.value.price : sellForm.value.price
  if (currentPrice !== 0) return

  useSuggestedPrice()
})

// Watch for tab changes to sync form values
watch(activeTab, (newTab, oldTab) => {
  if (newTab !== oldTab) {
    syncFormsOnTabChange(newTab, oldTab)
  }
})

// Load data when dialog opens
watch(dialog, open => {
  if (open) {
    errorMessage.value = ''
    activeTab.value = props.inventoryItem ? 'sell' : props.initialTab
    isBulkMode.value = false
    reservations.value = []
    bulkSelections.value = []
    suggestedPrice.value = null
    resetBuyForm()
    resetSellForm()
    if (props.initialCommodity) {
      buyForm.value.commodityTicker = props.initialCommodity
      sellForm.value.commodityTicker = props.initialCommodity
    }
    if (props.initialLocation) {
      buyForm.value.locationId = props.initialLocation
      sellForm.value.locationId = props.initialLocation
    }
    if (commodities.value.length === 0) {
      loadCommodities()
    }
    if (locations.value.length === 0) {
      loadLocations()
    }
    loadExistingSellOrders()
    if (props.inventoryItem) {
      loadSuggestedPrice()
    }
    setTimeout(() => {
      if (activeTab.value === 'buy') {
        buyCommodityRef.value?.focus()
      } else if (!props.inventoryItem) {
        sellCommodityRef.value?.focus()
      }
    }, 100)
  }
})

// Update sell form when inventory item changes
watch(
  () => props.inventoryItem,
  item => {
    if (item) {
      sellForm.value.commodityTicker = item.commodityTicker
      sellForm.value.locationId = item.locationId ?? ''
      sellForm.value.storageType = item.storageType ?? null
    }
  }
)

onMounted(() => {
  loadCommodities()
  loadLocations()
})
</script>

<style scoped>
.cursor-pointer {
  cursor: pointer;
}
</style>
