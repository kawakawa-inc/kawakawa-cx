<template>
  <v-container fluid>
    <h1 class="text-h4 mb-4">Market</h1>

    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Delete Confirmation Dialog -->
    <ConfirmationDialog
      v-model="deleteDialog"
      :title="`Delete ${deletingItem?.itemType === 'sell' ? 'Sell' : 'Buy'} Order`"
      :loading="deleting"
      confirm-text="Delete"
      confirm-color="error"
      @confirm="confirmDelete"
    >
      Are you sure you want to delete your
      {{ deletingItem?.itemType === 'sell' ? 'sell' : 'buy' }} order for
      <strong>{{ deletingItem ? getCommodityDisplay(deletingItem.commodityTicker) : '' }}</strong>
      at <strong>{{ deletingItem ? getLocationDisplay(deletingItem.locationId) : '' }}</strong
      >?
    </ConfirmationDialog>

    <!-- Shopping List Preference Dialog -->
    <ShoppingListPreferenceDialog v-model="showPreferenceDialog" @choice="onPreferenceChoice" />

    <!-- Contract Breakdown Dialog (shown after single invoice submission) -->
    <InvoiceDetailDialog v-model="showContractBreakdown" :invoice="submittedInvoice" />

    <!-- Submit All Results Dialog -->
    <v-dialog v-model="showSubmitAllResults" max-width="500">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon start color="success">mdi-check-all</v-icon>
          {{ submitAllResults.length }} Invoice{{ submitAllResults.length === 1 ? '' : 's' }}
          Submitted
        </v-card-title>

        <v-card-text class="pa-0">
          <v-list density="compact">
            <v-list-item v-for="result in submitAllResults" :key="result.invoiceId" class="px-4">
              <template #prepend>
                <v-icon color="success" size="small">mdi-check-circle</v-icon>
              </template>
              <v-list-item-title class="text-body-2">
                {{ result.counterpartyName }}
              </v-list-item-title>
              <v-list-item-subtitle class="text-caption">
                Invoice #{{ result.invoiceId }}
              </v-list-item-subtitle>
              <template #append>
                <v-btn
                  size="small"
                  variant="tonal"
                  color="primary"
                  @click="openContractForResult(result.invoiceId)"
                >
                  Contracts
                </v-btn>
              </template>
            </v-list-item>
          </v-list>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="showSubmitAllResults = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- New Invoice Dialog - Select counterparty -->
    <v-dialog v-model="newInvoiceDialog" max-width="400">
      <v-card>
        <v-card-title class="d-flex align-center">
          <v-icon start color="primary">mdi-file-document-plus-outline</v-icon>
          New Invoice
        </v-card-title>
        <v-card-text>
          <p class="text-body-2 text-medium-emphasis mb-4">
            Search for a member to create an invoice with:
          </p>
          <KeyValueAutocomplete
            v-model="selectedCounterpartyId"
            :items="counterpartyOptions"
            label="Select member"
            hide-favorite-stars
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="closeNewInvoiceDialog">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="elevated"
            :disabled="!selectedCounterpartyId"
            @click="confirmCreateInvoice"
          >
            Create Invoice
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Saved Filter Dialogs -->
    <SaveFilterDialog
      v-model="showSaveFilterDialog"
      :filter-data="getCurrentFilterData()"
      :existing-filter="currentSavedFilter"
      @saved="onFilterSaved"
    />
    <PublicFiltersBrowser
      v-model="showPublicFiltersBrowser"
      @apply="applySavedFilter"
      @copy-link="copyFilterLink"
    />

    <!-- Pinned Filters Bar -->
    <PinnedFiltersBar
      v-if="pinnedFilters.length > 0"
      :pinned-filters="pinnedFilters"
      class="mb-2"
      @apply="applySavedFilter"
    />

    <!-- Filters Card -->
    <v-card class="mb-4">
      <v-card-text class="py-2">
        <!-- Active Filters Display -->
        <div
          v-if="currentSavedFilter || (!filtersExpanded && hasActiveFilters)"
          class="d-flex flex-wrap ga-2 mb-3"
        >
          <!-- Active saved filter banner -->
          <v-chip
            v-if="currentSavedFilter"
            size="small"
            color="purple"
            prepend-icon="mdi-bookmark"
            closable
            @click:close="currentSavedFilter = null"
          >
            {{ currentSavedFilter.name }}
            <template #append>
              <v-icon
                size="small"
                class="ml-1"
                title="Copy shareable link"
                @click.stop="copyFilterLink(currentSavedFilter!.id)"
              >
                mdi-link-variant
              </v-icon>
            </template>
          </v-chip>
          <!-- Panel-only filter chips — only shown when panel is collapsed -->
          <template v-if="!filtersExpanded">
            <v-chip
              v-if="filters.category"
              closable
              size="small"
              color="secondary"
              @click:close="filters.category = null"
            >
              Category: {{ localizeMaterialCategory(filters.category as CommodityCategory) }}
            </v-chip>
            <v-chip
              v-if="filters.orderType"
              closable
              size="small"
              :color="filters.orderType === 'partner' ? 'primary' : 'default'"
              @click:close="filters.orderType = null"
            >
              {{ filters.orderType === 'partner' ? 'Partner' : 'Internal' }}
            </v-chip>
            <v-chip
              v-if="filters.pricing"
              closable
              size="small"
              :color="filters.pricing === 'custom' ? 'default' : 'info'"
              @click:close="filters.pricing = null"
            >
              {{ filters.pricing === 'custom' ? 'Custom Pricing' : filters.pricing }}
            </v-chip>
          </template>
        </div>

        <!-- Collapsible filter dropdowns -->
        <v-expand-transition>
          <v-row v-if="filtersExpanded" dense class="mb-2 filter-row">
            <v-col cols="6" sm="4" lg="2">
              <!-- Proxies itemType through chip system -->
              <v-select
                v-model="panelItemTypeModel"
                :items="itemTypeOptions"
                item-title="title"
                item-value="value"
                label="Buy/Sell"
                density="compact"
                clearable
                hide-details
              />
            </v-col>
            <v-col cols="6" sm="4" lg="2">
              <!-- Proxies commodity through chip system -->
              <KeyValueAutocomplete
                v-model="panelCommodityModel"
                :items="commodityOptions"
                :favorites="settingsStore.favoritedCommodities.value"
                :show-icons="hasIcons"
                label="Commodity"
                density="compact"
                clearable
                hide-details
                multiple
                @update:favorites="
                  settingsStore.updateSetting('market.favoritedCommodities', $event)
                "
              />
            </v-col>
            <v-col cols="6" sm="4" lg="2">
              <v-select
                v-model="filters.category"
                :items="categoryOptions"
                label="Category"
                density="compact"
                clearable
                hide-details
              />
            </v-col>
            <v-col cols="6" sm="4" lg="2">
              <!-- Proxies location through chip system -->
              <KeyValueAutocomplete
                v-model="panelLocationModel"
                :items="locationOptions"
                :favorites="settingsStore.favoritedLocations.value"
                label="Location"
                density="compact"
                clearable
                hide-details
                multiple
                @update:favorites="settingsStore.updateSetting('market.favoritedLocations', $event)"
              />
            </v-col>
            <v-col cols="6" sm="4" lg="2">
              <v-select
                v-model="filters.pricing"
                :items="pricingOptions"
                item-title="title"
                item-value="value"
                label="Pricing"
                density="compact"
                clearable
                hide-details
              />
            </v-col>
            <v-col cols="6" sm="4" lg="2">
              <v-select
                v-model="filters.orderType"
                :items="visibilityOptions"
                item-title="title"
                item-value="value"
                label="Visibility"
                density="compact"
                clearable
                hide-details
              />
            </v-col>
            <v-col cols="6" sm="4" lg="2">
              <!-- Proxies user through chip system -->
              <v-select
                v-model="panelUserModel"
                :items="userNameOptions"
                item-title="title"
                item-value="value"
                label="User"
                density="compact"
                clearable
                hide-details
                multiple
                chips
              />
            </v-col>
          </v-row>
        </v-expand-transition>

        <!-- Always visible buttons row -->
        <v-row dense align="center">
          <v-col cols="auto" class="d-flex ga-2 flex-wrap">
            <v-btn
              variant="outlined"
              size="small"
              :prepend-icon="filtersExpanded ? 'mdi-filter-variant-minus' : 'mdi-filter-variant'"
              @click="filtersExpanded = !filtersExpanded"
            >
              {{ filtersExpanded ? 'Hide Filters' : 'Filters' }}
            </v-btn>
            <v-btn
              v-if="hasActiveFilters || hasSearchChips"
              variant="text"
              color="primary"
              size="small"
              @click="clearFiltersWithList"
            >
              Clear Filters
            </v-btn>
            <v-btn
              variant="text"
              size="small"
              prepend-icon="mdi-bookmark-outline"
              @click="showSaveFilterDialog = true"
            >
              Save Filter
            </v-btn>
            <SavedFiltersMenu
              :current-filter-data="getCurrentFilterData()"
              :can-pin="canPinFilters"
              @apply="applySavedFilter"
              @copy-link="copyFilterLink"
              @saved="onFilterSaved"
            />
            <v-btn
              variant="text"
              size="small"
              prepend-icon="mdi-earth"
              @click="showPublicFiltersBrowser = true"
            >
              Browse
            </v-btn>
          </v-col>
          <v-spacer />
          <v-col cols="auto">
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
                    @click="openOrderDialog"
                  >
                    Create Order
                  </v-btn>
                </span>
              </template>
            </v-tooltip>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Market Listings Table -->
    <v-card>
      <v-card-title class="d-flex align-center">
        <kbd class="search-shortcut mr-2" title="Press / to focus search">/</kbd>
        <TokenSearchInput
          ref="tokenSearchRef"
          :get-commodity-display="getCommodityDisplay"
          :get-location-display="getLocationDisplay"
          :get-commodity-name="getCommodityName"
          placeholder="Search: COF, BEN, Buy, Sell..."
          class="flex-grow-1"
          @update:chips="onChipsUpdate"
        />
        <v-menu location="bottom" :close-on-content-click="false" max-width="360">
          <template #activator="{ props }">
            <v-btn
              v-bind="props"
              icon="mdi-help-circle-outline"
              variant="text"
              size="small"
              color="grey"
              class="ml-1"
            />
          </template>
          <v-card>
            <v-card-title class="text-subtitle-1 pb-1">Search Syntax</v-card-title>
            <v-card-text class="pt-0">
              <p class="text-body-2 mb-2">
                Type and press space to create filter chips. Multiple chips are combined with AND
                logic.
              </p>
              <v-table density="compact" class="text-body-2">
                <tbody>
                  <tr>
                    <td class="font-weight-medium">COF</td>
                    <td>Filter by commodity</td>
                  </tr>
                  <tr>
                    <td class="font-weight-medium">BEN</td>
                    <td>Filter by location</td>
                  </tr>
                  <tr>
                    <td class="font-weight-medium">Buy / Sell</td>
                    <td>Filter by order type</td>
                  </tr>
                  <tr>
                    <td class="font-weight-medium">commodity:RAT</td>
                    <td>Explicit commodity</td>
                  </tr>
                  <tr>
                    <td class="font-weight-medium">location:ANT</td>
                    <td>Explicit location</td>
                  </tr>
                  <tr>
                    <td class="font-weight-medium">user:Alice</td>
                    <td>Filter by seller</td>
                  </tr>
                  <tr>
                    <td class="font-weight-medium text-purple">XIT JSON</td>
                    <td>Paste PRUNplanner JSON</td>
                  </tr>
                </tbody>
              </v-table>
              <p class="text-body-2 text-medium-emphasis mt-2 mb-0">
                Unrecognized text searches commodity names.
              </p>
            </v-card-text>
          </v-card>
        </v-menu>
        <!-- Side Panel Toggle Button -->
        <v-btn
          icon
          variant="text"
          size="small"
          :color="sidePanelOpen ? 'primary' : 'grey'"
          class="ml-1"
          @click="toggleSidePanel"
        >
          <v-icon>{{ sidePanelOpen ? 'mdi-dock-right' : 'mdi-clipboard-list-outline' }}</v-icon>
          <v-tooltip activator="parent" location="bottom">
            {{ sidePanelOpen ? 'Hide side panel' : 'Show side panel' }}
          </v-tooltip>
        </v-btn>
      </v-card-title>

      <!-- Not Found Banner -->
      <v-alert
        v-if="notFoundCommodities.length > 0"
        type="info"
        variant="tonal"
        density="compact"
        class="mx-4 mb-2"
      >
        <span class="font-weight-medium">Not found:</span>
        {{ notFoundCommodities.map(ticker => getCommodityDisplay(ticker)).join(', ') }}
      </v-alert>

      <v-data-table
        :key="shoppingListKey"
        :headers="headers"
        :items="filteredItems"
        :loading="loading"
        :items-per-page="25"
        :row-props="getRowProps"
        :item-value="item => `${item.itemType}-${item.id}`"
        :class="['elevation-0', 'clickable-rows', { 'icon-rows': hasIcons }]"
        @click:row="onRowClick"
      >
        <template #item.itemType="{ item }">
          <v-chip
            :color="item.itemType === 'sell' ? 'success' : 'warning'"
            size="small"
            variant="flat"
            class="clickable-chip"
            @click.stop="addFilterChip('itemType', item.itemType)"
          >
            {{ item.itemType === 'sell' ? 'SELL' : 'BUY' }}
          </v-chip>
        </template>

        <template #item.commodityTicker="{ item }">
          <a
            href="#"
            class="font-weight-medium filter-link"
            @click.stop.prevent="addFilterChip('commodity', item.commodityTicker)"
          >
            <CommodityDisplay :ticker="item.commodityTicker" />
          </a>
        </template>

        <template #item.category="{ item }">
          <a
            v-if="getCommodityCategory(item.commodityTicker)"
            href="#"
            class="filter-link"
            @click.stop.prevent="setFilter('category', getCommodityCategory(item.commodityTicker))"
          >
            {{
              localizeMaterialCategory(
                getCommodityCategory(item.commodityTicker) as CommodityCategory
              )
            }}
          </a>
        </template>

        <template #item.locationId="{ item }">
          <a
            href="#"
            class="font-weight-medium filter-link"
            @click.stop.prevent="addFilterChip('location', item.locationId)"
          >
            {{ getLocationDisplay(item.locationId) }}
          </a>
        </template>

        <template #item.userName="{ item }">
          <a
            href="#"
            class="filter-link"
            :class="{ 'font-weight-medium': item.isOwn }"
            @click.stop.prevent="addFilterChip('userName', item.userName)"
            >{{ item.userName }}</a
          >
        </template>

        <template #item.fioUploadedAt="{ item }">
          <FioAgeChip :fio-uploaded-at="item.fioUploadedAt" />
        </template>

        <template #item.price="{ item }">
          <div class="d-flex align-center">
            <template v-if="getDisplayPrice(item) !== null">
              <span class="font-weight-medium">
                {{
                  getDisplayPrice(item)!.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })
                }}
              </span>
              <span class="text-caption text-medium-emphasis ml-1">{{ item.currency }}</span>
            </template>
            <span v-else class="text-medium-emphasis">--</span>
            <!-- Inline pricing chip for small screens -->
            <PricingModeChip
              v-if="item.pricingMode === 'dynamic'"
              :pricing-mode="item.pricingMode"
              :price-list-code="item.priceListCode"
              size="x-small"
              class="ml-2 d-lg-none"
            />
          </div>
        </template>

        <template #item.pricingMode="{ item }">
          <PricingModeChip
            :pricing-mode="item.pricingMode"
            :price-list-code="item.priceListCode"
            clickable
            @click:dynamic="setFilter('pricing', $event)"
            @click:custom="setFilter('pricing', 'custom')"
          />
        </template>

        <template #item.quantity="{ item }">
          <v-tooltip location="top">
            <template #activator="{ props }">
              <span v-bind="props" class="font-weight-medium">
                {{ item.remainingQuantity.toLocaleString() }}
              </span>
            </template>
            <div>
              <div>Total: {{ item.quantity.toLocaleString() }}</div>
              <div v-if="item.reservedQuantity > 0">
                {{ item.itemType === 'buy' ? 'Filled' : 'Reserved' }}:
                {{ item.reservedQuantity.toLocaleString() }}
              </div>
              <div>Remaining: {{ item.remainingQuantity.toLocaleString() }}</div>
            </div>
          </v-tooltip>
        </template>

        <template #item.orderType="{ item }">
          <OrderTypeChip
            :order-type="item.orderType"
            clickable
            @click="setFilter('orderType', $event)"
          />
        </template>

        <template #item.reserve="{ item }">
          <!-- Own order that matches shopping list -->
          <v-chip
            v-if="item.isOwn && isOnShoppingList(item)"
            size="small"
            color="info"
            variant="tonal"
            class="own-order-chip"
          >
            <v-icon start size="small">mdi-account-check</v-icon>
            Your Order
          </v-chip>
          <!-- Other user's order - show invoice button -->
          <v-btn
            v-else-if="!item.isOwn && canReserveOrder(item)"
            size="small"
            variant="elevated"
            :color="isItemInInvoice(item) ? 'primary' : isListSatisfied(item) ? 'grey' : 'primary'"
            :disabled="isListSatisfied(item) && !isItemInInvoice(item)"
            @click.stop="openAddToInvoiceDialog(item)"
          >
            <template v-if="isItemInInvoice(item)">
              <v-icon start size="small">mdi-pencil</v-icon>
              Update
            </template>
            <template v-else-if="isListSatisfied(item)">
              <v-icon start size="small">mdi-check</v-icon>
              Done
            </template>
            <template v-else-if="getListQuantity(item) !== null">
              <v-icon start size="small">mdi-plus</v-icon>
              Invoice {{ getListQuantity(item) }}
            </template>
            <template v-else>
              <v-icon start size="small">mdi-plus</v-icon>
              Invoice
            </template>
          </v-btn>
        </template>

        <template #item.actions="{ item }">
          <v-menu>
            <template #activator="{ props }">
              <v-btn v-bind="props" icon size="small" variant="text" @click.stop>
                <v-icon>mdi-dots-vertical</v-icon>
              </v-btn>
            </template>
            <v-list density="compact">
              <!-- Add to Invoice option for small screens -->
              <v-list-item
                v-if="!item.isOwn && canReserveOrder(item)"
                class="d-lg-none"
                :disabled="isListSatisfied(item) && !isItemInInvoice(item)"
                @click="openAddToInvoiceDialog(item)"
              >
                <template #prepend>
                  <v-icon
                    :color="
                      isItemInInvoice(item) ? 'primary' : isListSatisfied(item) ? 'grey' : 'primary'
                    "
                  >
                    {{
                      isItemInInvoice(item)
                        ? 'mdi-pencil'
                        : isListSatisfied(item)
                          ? 'mdi-check'
                          : 'mdi-plus'
                    }}
                  </v-icon>
                </template>
                <v-list-item-title>
                  <template v-if="isItemInInvoice(item)">Update</template>
                  <template v-else-if="isListSatisfied(item)">Done</template>
                  <template v-else-if="getListQuantity(item) !== null">
                    + Invoice {{ getListQuantity(item) }}
                  </template>
                  <template v-else>+ Invoice</template>
                </v-list-item-title>
              </v-list-item>
              <v-list-item @click="viewOrder(item)">
                <template #prepend>
                  <v-icon>mdi-eye</v-icon>
                </template>
                <v-list-item-title>View</v-list-item-title>
              </v-list-item>
              <v-list-item v-if="item.isOwn" @click="openEditDialog(item)">
                <template #prepend>
                  <v-icon color="primary">mdi-pencil</v-icon>
                </template>
                <v-list-item-title>Edit</v-list-item-title>
              </v-list-item>
              <v-list-item v-if="item.isOwn" @click="openDeleteDialog(item)">
                <template #prepend>
                  <v-icon color="error">mdi-delete</v-icon>
                </template>
                <v-list-item-title>Delete</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </template>

        <template #no-data>
          <div class="text-center py-8">
            <v-icon size="64" color="grey-lighten-1">mdi-storefront-outline</v-icon>
            <p class="text-h6 mt-4">No orders available</p>
            <p class="text-body-2 text-medium-emphasis">
              <template v-if="hasActiveFilters || hasSearchChips">
                No orders match your filters.
                <a href="#" @click.prevent="clearFiltersWithList">Clear filters</a>
              </template>
              <template v-else> No orders yet. Check back later! </template>
            </p>
          </div>
        </template>
      </v-data-table>
    </v-card>

    <!-- Order Dialog -->
    <OrderDialog v-model="orderDialog" :initial-tab="orderDialogTab" @created="onOrderCreated" />

    <!-- Edit Order Dialog -->
    <v-dialog
      v-model="editDialog"
      max-width="500"
      :persistent="editDialogBehavior.persistent.value"
      :no-click-animation="editDialogBehavior.noClickAnimation"
    >
      <v-card>
        <v-card-title
          >Edit {{ editingItem?.itemType === 'sell' ? 'Sell' : 'Buy' }} Order</v-card-title
        >
        <v-card-text>
          <v-alert type="info" variant="tonal" class="mb-4" density="compact">
            <div>
              <strong>{{
                editingItem ? getCommodityDisplay(editingItem.commodityTicker) : ''
              }}</strong>
            </div>
            <div class="text-caption">
              {{ editingItem ? getLocationDisplay(editingItem.locationId) : '' }}
            </div>
          </v-alert>

          <v-form ref="editFormRef">
            <!-- Quantity (only for buy orders) -->
            <v-text-field
              v-if="editingItem?.itemType === 'buy'"
              v-model.number="editForm.quantity"
              label="Quantity"
              type="number"
              min="1"
              :rules="[v => v > 0 || 'Quantity must be positive']"
              required
              class="mb-2"
            />

            <!-- Automatic Pricing Toggle -->
            <div class="d-flex align-center mb-3 text-body-2">
              <span class="text-medium-emphasis">Automatic Pricing:</span>
              <a
                v-if="editForm.usePriceList"
                href="#"
                tabindex="-1"
                class="ml-2 font-weight-medium text-primary"
                @click.prevent="toggleEditPricing(false)"
              >
                ON
              </a>
              <a
                v-else-if="canUseDynamicPricing"
                href="#"
                tabindex="-1"
                class="ml-2 font-weight-medium text-primary"
                @click.prevent="toggleEditPricing(true)"
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
                v-if="editForm.usePriceList"
                size="x-small"
                color="info"
                variant="tonal"
                class="ml-2"
              >
                {{ editForm.priceListCode }}
              </v-chip>
            </div>

            <!-- Dynamic Pricing Display (when using price list) -->
            <PriceListDisplay
              v-if="editForm.usePriceList"
              :loading="loadingEditSuggestedPrice"
              :price="editSuggestedPrice"
              :price-list-code="settingsStore.defaultPriceList.value ?? ''"
              :requested-currency="editForm.currency"
              :fallback-location-display="
                editSuggestedPrice?.locationId
                  ? getLocationDisplay(editSuggestedPrice.locationId)
                  : ''
              "
              :requested-location-display="
                editSuggestedPrice?.requestedLocationId
                  ? getLocationDisplay(editSuggestedPrice.requestedLocationId)
                  : ''
              "
              class="mb-4"
            />

            <!-- Custom Price Input (when not using price list) -->
            <v-row v-if="!editForm.usePriceList">
              <v-col cols="8">
                <v-text-field
                  v-model.number="editForm.price"
                  label="Unit Price"
                  type="number"
                  min="0"
                  step="0.01"
                  :rules="[v => v > 0 || 'Price must be positive']"
                  required
                />
              </v-col>
              <v-col cols="4">
                <v-select v-model="editForm.currency" :items="currencies" label="Currency" />
              </v-col>
            </v-row>

            <v-select
              v-model="editForm.orderType"
              :items="orderTypes"
              item-title="title"
              item-value="value"
              label="Visibility"
            />
          </v-form>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn text @click="editDialog = false">Cancel</v-btn>
          <v-btn color="primary" :loading="saving" @click="saveEdit"> Save Changes </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Add to Invoice Dialog -->
    <v-dialog v-model="addToInvoiceDialog" max-width="400">
      <v-card v-if="addingToInvoiceItem">
        <v-card-title class="d-flex align-center">
          <v-icon start :color="addingToInvoiceItem.itemType === 'sell' ? 'warning' : 'success'">
            {{
              addingToInvoiceItem.itemType === 'sell'
                ? 'mdi-cart-arrow-down'
                : 'mdi-package-variant'
            }}
          </v-icon>
          {{
            isUpdatingExisting
              ? 'Update'
              : addingToInvoiceItem.itemType === 'sell'
                ? 'Buy from'
                : 'Sell to'
          }}
          {{ addingToInvoiceItem.userName }}
        </v-card-title>

        <v-card-text>
          <v-alert
            v-if="isUpdatingExisting"
            type="warning"
            variant="tonal"
            class="mb-4"
            density="compact"
          >
            This item is already in your invoice. Updating the quantity.
          </v-alert>

          <v-alert type="info" variant="tonal" class="mb-4" density="compact">
            <div>
              <strong>{{ getCommodityDisplay(addingToInvoiceItem.commodityTicker) }}</strong>
            </div>
            <div class="text-caption">
              {{ getLocationDisplay(addingToInvoiceItem.locationId) }}
            </div>
            <div class="text-caption mt-1">
              Price:
              {{
                getDisplayPrice(addingToInvoiceItem)?.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }) ?? '--'
              }}
              {{ addingToInvoiceItem.currency }}/unit
            </div>
          </v-alert>

          <v-text-field
            ref="invoiceQuantityInputRef"
            v-model.number="addToInvoiceQuantity"
            label="Quantity"
            type="number"
            min="1"
            :rules="[v => v > 0 || 'Quantity must be positive']"
            required
          />

          <div class="text-body-2 text-medium-emphasis">
            Listed: {{ addingToInvoiceItem.remainingQuantity.toLocaleString() }}
            <span
              v-if="
                addToInvoiceQuantity && addToInvoiceQuantity > addingToInvoiceItem.remainingQuantity
              "
              class="text-warning"
            >
              (requesting
              {{ (addToInvoiceQuantity - addingToInvoiceItem.remainingQuantity).toLocaleString() }}
              over listed amount)
            </span>
          </div>
        </v-card-text>

        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="addToInvoiceDialog = false">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="elevated"
            :loading="addingToInvoice"
            :disabled="!addToInvoiceQuantity || addToInvoiceQuantity <= 0"
            @click="confirmAddToInvoice"
          >
            {{ isUpdatingExisting ? 'Update Quantity' : 'Add to Invoice' }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Order Detail Dialog -->
    <OrderDetailDialog
      v-model="orderDetailDialog"
      :order-type="orderDetailType"
      :order-id="orderDetailId"
      @deleted="loadMarketItems"
      @updated="loadMarketItems"
      @edit="onEditFromDetail"
    />

    <!-- Side Panel with Invoice and Shopping List (slides in from right) -->
    <v-navigation-drawer
      v-model="sidePanelOpen"
      location="right"
      width="370"
      class="side-panel-drawer"
    >
      <!-- Panel Header with close button (visible on smaller screens) -->
      <div class="side-panel-header d-lg-none">
        <span class="text-subtitle-2">Invoice & Shopping List</span>
        <v-btn icon size="small" variant="text" @click="sidePanelOpen = false">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </div>
      <div class="side-panel-content">
        <ResizableSplitPanel
          :top-min-height="150"
          :bottom-min-height="150"
          storage-key="market-panel-ratio"
          :initial-ratio="0.6"
        >
          <template #top>
            <InvoiceSummaryPanel
              @invoice-submitted="onInvoiceSubmitted"
              @all-invoices-submitted="onAllInvoicesSubmitted"
              @filter-add="onFilterAdd"
              @add-invoice="onAddInvoice"
            />
          </template>
          <template #bottom>
            <ShoppingListPanel
              :list-status="shoppingListPanelStatus"
              :get-commodity-display="getCommodityDisplay"
              @clear="onShoppingListClear"
              @filter-by-list="onFilterByList"
            />
          </template>
        </ResizableSplitPanel>
      </div>
    </v-navigation-drawer>
  </v-container>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import {
  PERMISSIONS,
  type Currency,
  type OrderType,
  type Invoice,
  type SavedMarketFilter,
} from '@kawakawa/types'
import type { XitMaterials } from '@kawakawa/types/xit'
import { api, type EffectivePrice } from '../services/api'
import { useUserStore } from '../stores/user'
import { useSettingsStore } from '../stores/settings'
import {
  useSnackbar,
  useDisplayHelpers,
  useFormatters,
  useOrderDeepLink,
  useUrlFilters,
  useDialogBehavior,
  useMarketData,
  getDisplayPrice,
  type MarketItem,
  type MarketItemType,
} from '../composables'
import OrderDialog from '../components/OrderDialog.vue'
import OrderDetailDialog from '../components/OrderDetailDialog.vue'
import PriceListDisplay from '../components/PriceListDisplay.vue'
import ConfirmationDialog from '../components/ConfirmationDialog.vue'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'
import FioAgeChip from '../components/FioAgeChip.vue'
import OrderTypeChip from '../components/OrderTypeChip.vue'
import PricingModeChip from '../components/PricingModeChip.vue'
import CommodityDisplay from '../components/CommodityDisplay.vue'
import TokenSearchInput, { type SearchChip } from '../components/TokenSearchInput.vue'
import InvoiceSummaryPanel from '../components/invoices/InvoiceSummaryPanel.vue'
import InvoiceDetailDialog from '../components/invoices/InvoiceDetailDialog.vue'
import ResizableSplitPanel from '../components/ResizableSplitPanel.vue'
import ShoppingListPanel, {
  type ListItemStatus as ShoppingListStatus,
} from '../components/ShoppingListPanel.vue'
import ShoppingListPreferenceDialog from '../components/ShoppingListPreferenceDialog.vue'
import SaveFilterDialog from '../components/SaveFilterDialog.vue'
import SavedFiltersMenu from '../components/SavedFiltersMenu.vue'
import PinnedFiltersBar from '../components/PinnedFiltersBar.vue'
import PublicFiltersBrowser from '../components/PublicFiltersBrowser.vue'
import { localizeMaterialCategory } from '../utils/materials'
import { useShoppingListStore } from '../stores/shoppingList'
import { locationService } from '../services/locationService'
import type { CommodityCategory } from '@kawakawa/types'
import { useInvoicesStore } from '../stores/invoices'

const userStore = useUserStore()
const invoicesStore = useInvoicesStore()
const settingsStore = useSettingsStore()
const shoppingListStore = useShoppingListStore()
const route = useRoute()
const router = useRouter()
const { snackbar, showSnackbar } = useSnackbar()
const { getLocationDisplay, getCommodityDisplay, getCommodityCategory, getCommodityName } =
  useDisplayHelpers()
const { getFioAgeColor } = useFormatters()

// Check if commodity icons are enabled
const hasIcons = computed(() => settingsStore.commodityIconStyle.value !== 'none')

// Market data from composable
const { marketItems, loading, loadMarketItems } = useMarketData({
  onError: () => showSnackbar('Failed to load market items', 'error'),
})

const headers = [
  {
    title: '',
    key: 'itemType',
    sortable: true,
    width: 70,
    cellProps: { class: 'd-none d-lg-table-cell' },
    headerProps: { class: 'd-none d-lg-table-cell' },
  },
  { title: 'Qty', key: 'quantity', sortable: true, align: 'end' as const, width: 80 },
  {
    title: 'Commodity',
    key: 'commodityTicker',
    sortable: true,
    cellProps: { class: 'col-commodity' },
    headerProps: { class: 'col-commodity' },
  },
  {
    title: 'Category',
    key: 'category',
    sortable: true,
    cellProps: { class: 'd-none d-lg-table-cell' },
    headerProps: { class: 'd-none d-lg-table-cell' },
  },
  {
    title: 'Location',
    key: 'locationId',
    sortable: true,
    cellProps: { class: 'col-location' },
    headerProps: { class: 'col-location' },
  },
  { title: 'User', key: 'userName', sortable: true, width: 120 },
  {
    title: 'FIO Age',
    key: 'fioUploadedAt',
    sortable: true,
    cellProps: { class: 'd-none d-lg-table-cell' },
    headerProps: { class: 'd-none d-lg-table-cell' },
  },
  { title: 'Unit Price', key: 'price', sortable: true },
  {
    title: 'Pricing',
    key: 'pricingMode',
    sortable: true,
    cellProps: { class: 'd-none d-lg-table-cell' },
    headerProps: { class: 'd-none d-lg-table-cell' },
  },
  {
    title: 'Visibility',
    key: 'orderType',
    sortable: true,
    cellProps: { class: 'd-none d-lg-table-cell' },
    headerProps: { class: 'd-none d-lg-table-cell' },
  },
  {
    title: '',
    key: 'reserve',
    sortable: false,
    width: 90,
    cellProps: { class: 'd-none d-lg-table-cell' },
    headerProps: { class: 'd-none d-lg-table-cell' },
  },
  { title: '', key: 'actions', sortable: false, width: 50 },
]

// Token search input ref and state
const tokenSearchRef = ref<InstanceType<typeof TokenSearchInput> | null>(null)
const searchChips = ref<SearchChip[]>([])

// Saved filters state
const pinnedFilters = ref<SavedMarketFilter[]>([])
const currentSavedFilter = ref<SavedMarketFilter | null>(null)
const showSaveFilterDialog = ref(false)

const showPublicFiltersBrowser = ref(false)

// Check if user can pin filters
const canPinFilters = computed(() => userStore.hasPermission(PERMISSIONS.FILTERS_PIN))

const orderDialog = ref(false)
const orderDialogTab = ref<'buy' | 'sell'>('buy')

// Order detail dialog with deep linking
const {
  dialogOpen: orderDetailDialog,
  orderType: orderDetailType,
  orderId: orderDetailId,
  openOrder,
} = useOrderDeepLink()

// Edit dialog
const editDialog = ref(false)
const editDialogBehavior = useDialogBehavior({ modelValue: editDialog })
const editingItem = ref<MarketItem | null>(null)
const editFormRef = ref()
const saving = ref(false)

const currencies: Currency[] = ['ICA', 'CIS', 'AIC', 'NCC']

// Check permissions for order creation
const canCreateInternalOrders = computed(() =>
  userStore.hasPermission(PERMISSIONS.ORDERS_POST_INTERNAL)
)
const canCreatePartnerOrders = computed(() =>
  userStore.hasPermission(PERMISSIONS.ORDERS_POST_PARTNER)
)

// Check permissions for reservations
const canReserveInternal = computed(() =>
  userStore.hasPermission(PERMISSIONS.RESERVATIONS_PLACE_INTERNAL)
)
const canReservePartner = computed(() =>
  userStore.hasPermission(PERMISSIONS.RESERVATIONS_PLACE_PARTNER)
)

const canReserveOrder = (item: MarketItem): boolean => {
  if (item.isOwn) return false
  // Note: we allow invoicing even when remainingQuantity is 0 for made-to-order items
  if (item.orderType === 'internal') return canReserveInternal.value
  if (item.orderType === 'partner') return canReservePartner.value
  return false
}

// Check if an order is already in any draft invoice
// Uses the store's isOrderInAnyDraftInvoice which checks all loaded invoices
const isItemInInvoice = (item: MarketItem): boolean => {
  return invoicesStore.isOrderInAnyDraftInvoice(item.id, item.itemType)
}

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

const editForm = ref({
  price: 0,
  currency: 'CIS' as Currency,
  orderType: 'internal' as OrderType,
  quantity: 0, // Only used for buy orders
  usePriceList: false,
  priceListCode: null as string | null,
})

// Suggested price for edit dialog
const loadingEditSuggestedPrice = ref(false)
const editSuggestedPrice = ref<EffectivePrice | null>(null)

// Check if user can use dynamic pricing (has a default price list)
const canUseDynamicPricing = computed(() => {
  return settingsStore.defaultPriceList.value !== null
})

// Delete dialog
const deleteDialog = ref(false)
const deletingItem = ref<MarketItem | null>(null)
const deleting = ref(false)

// Add to Invoice dialog (replaces Reserve dialog)
const addToInvoiceDialog = ref(false)
const addingToInvoiceItem = ref<MarketItem | null>(null)
const addToInvoiceQuantity = ref<number | null>(null)
const addingToInvoice = ref(false)
const invoiceQuantityInputRef = ref<{ focus: () => void } | null>(null)

// Check if current item already exists in active invoice
const existingLineItem = computed(() => {
  if (!addingToInvoiceItem.value || !invoicesStore.activeInvoice.value) return null
  const item = addingToInvoiceItem.value
  return (
    invoicesStore.activeInvoice.value.lineItems.find(
      li =>
        (item.itemType === 'sell' && li.sellOrderId === item.id) ||
        (item.itemType === 'buy' && li.buyOrderId === item.id)
    ) ?? null
  )
})

const isUpdatingExisting = computed(() => existingLineItem.value !== null)

// New Invoice dialog state
const newInvoiceDialog = ref(false)
const selectedCounterpartyId = ref<string | null>(null)

// Available counterparties (all users with orders we can reserve - both buyers and sellers)
const counterpartyOptions = computed((): KeyValueItem[] => {
  const counterpartyMap = new Map<
    number,
    { userId: number; userName: string; orderCount: number }
  >()

  for (const item of marketItems.value) {
    // Include all orders we can reserve (not our own, with permission)
    if (!item.isOwn && canReserveOrder(item)) {
      const existing = counterpartyMap.get(item.userId)
      if (existing) {
        existing.orderCount++
      } else {
        counterpartyMap.set(item.userId, {
          userId: item.userId,
          userName: item.userName,
          orderCount: 1,
        })
      }
    }
  }

  // Convert to KeyValueItem format, sorted by name
  return Array.from(counterpartyMap.values())
    .sort((a, b) => a.userName.localeCompare(b.userName))
    .map(cp => ({
      key: String(cp.userId),
      display: `${cp.userName} (${cp.orderCount} order${cp.orderCount === 1 ? '' : 's'})`,
      name: cp.userName,
    }))
})

// Close new invoice dialog and reset state
const closeNewInvoiceDialog = () => {
  newInvoiceDialog.value = false
  selectedCounterpartyId.value = null
}

// Create invoice for selected counterparty
const confirmCreateInvoice = async () => {
  if (!selectedCounterpartyId.value) return
  const counterpartyUserId = parseInt(selectedCounterpartyId.value, 10)
  closeNewInvoiceDialog()
  const invoice = await invoicesStore.getOrCreateForPartner(counterpartyUserId)
  if (invoice) {
    await invoicesStore.setActiveInvoice(invoice.id)
    sidePanelOpen.value = true
  }
}

// Filters with URL deep linking
const { filters, hasActiveFilters, clearFilters, setFilter } = useUrlFilters({
  schema: {
    itemType: { type: 'string' },
    commodity: { type: 'array' },
    category: { type: 'string' },
    location: { type: 'array' },
    userName: { type: 'array' },
    orderType: { type: 'string' },
    pricing: { type: 'string' },
  },
})
const filtersExpanded = ref(false)

// Get FIO age border class for responsive view
const getFioBorderClass = (fioUploadedAt: string | null): string => {
  if (!fioUploadedAt) return 'fio-border-none'
  const color = getFioAgeColor(fioUploadedAt)
  return `fio-border-${color}`
}

// Row highlighting for own orders, alternating colors, and XIT quantity matching
const getRowProps = ({ item, index }: { item: MarketItem; index: number }) => {
  const classes: string[] = []
  if (item.isOwn) classes.push('own-listing-row')
  if (index % 2 === 1) classes.push('alt-row')
  // Add border classes for responsive view
  classes.push(item.itemType === 'sell' ? 'type-border-sell' : 'type-border-buy')
  classes.push(getFioBorderClass(item.fioUploadedAt))

  // XIT quantity highlighting (only for sell orders in XIT mode)
  // Use remainingListNeeds to account for quantities already claimed in invoices
  if (isListActive.value && item.itemType === 'sell') {
    const remaining = remainingListNeeds.value[item.commodityTicker]
    if (remaining !== undefined && remaining > 0) {
      if (item.remainingQuantity >= remaining) {
        classes.push('list-row-success')
      } else {
        classes.push('list-row-warning')
      }
    }
  }

  return { class: classes.join(' ') }
}

// Computed filter options based on market items data
const itemTypeOptions = [
  { title: 'Sell', value: 'sell' as MarketItemType },
  { title: 'Buy', value: 'buy' as MarketItemType },
]

// Panel computed models that proxy chip state (panel writes chips, chips are source of truth)
const panelItemTypeModel = computed({
  get: () => searchChips.value.find(c => c.type === 'itemType')?.value ?? null,
  set: (value: string | null) => {
    if (value) {
      tokenSearchRef.value?.addChip({
        type: 'itemType',
        value,
        display: value === 'buy' ? 'Buy' : 'Sell',
      })
    } else {
      tokenSearchRef.value?.removeChipByTypeValue('itemType', 'buy')
      tokenSearchRef.value?.removeChipByTypeValue('itemType', 'sell')
    }
  },
})

const panelCommodityModel = computed({
  get: () => searchChips.value.filter(c => c.type === 'commodity').map(c => c.value),
  set: (newValues: string[]) => {
    const current = searchChips.value.filter(c => c.type === 'commodity').map(c => c.value)
    for (const v of newValues) {
      if (!current.includes(v)) {
        tokenSearchRef.value?.addChip({
          type: 'commodity',
          value: v,
          display: getCommodityDisplay(v),
        })
      }
    }
    for (const v of current) {
      if (!newValues.includes(v)) {
        tokenSearchRef.value?.removeChipByTypeValue('commodity', v)
      }
    }
  },
})

const panelLocationModel = computed({
  get: () => searchChips.value.filter(c => c.type === 'location').map(c => c.value),
  set: (newValues: string[]) => {
    const current = searchChips.value.filter(c => c.type === 'location').map(c => c.value)
    for (const v of newValues) {
      if (!current.includes(v)) {
        tokenSearchRef.value?.addChip({
          type: 'location',
          value: v,
          display: getLocationDisplay(v),
        })
      }
    }
    for (const v of current) {
      if (!newValues.includes(v)) {
        tokenSearchRef.value?.removeChipByTypeValue('location', v)
      }
    }
  },
})

const panelUserModel = computed({
  get: () => searchChips.value.filter(c => c.type === 'user').map(c => c.value),
  set: (newValues: string[]) => {
    const current = searchChips.value.filter(c => c.type === 'user').map(c => c.value)
    for (const v of newValues) {
      if (!current.includes(v)) {
        tokenSearchRef.value?.addChip({
          type: 'user',
          value: v,
          display: v,
        })
      }
    }
    for (const v of current) {
      if (!newValues.includes(v)) {
        tokenSearchRef.value?.removeChipByTypeValue('user', v)
      }
    }
  },
})

const commodityOptions = computed((): KeyValueItem[] => {
  const tickers = new Set(marketItems.value.map(l => l.commodityTicker))
  return Array.from(tickers).map(ticker => ({
    key: ticker,
    display: getCommodityDisplay(ticker),
    name: getCommodityName(ticker),
    category: getCommodityCategory(ticker) ?? undefined,
  }))
})

const categoryOptions = computed(() => {
  const categories = new Set(
    marketItems.value.map(l => getCommodityCategory(l.commodityTicker)).filter(Boolean)
  )
  return Array.from(categories)
    .sort()
    .map(cat => ({
      title: localizeMaterialCategory(cat as CommodityCategory),
      value: cat,
    }))
})

const locationOptions = computed((): KeyValueItem[] => {
  const locations = new Set(marketItems.value.map(l => l.locationId))
  return Array.from(locations).map(id => ({
    key: id,
    display: getLocationDisplay(id),
    locationType: locationService.getLocationType(id) ?? undefined,
    isUserLocation: locationService.isUserLocation(id),
    storageTypes: locationService.getStorageTypes(id),
  }))
})

const userNameOptions = computed(() => {
  const userNames = new Set(marketItems.value.map(l => l.userName))
  return Array.from(userNames)
    .sort()
    .map(name => ({
      title: name,
      value: name,
    }))
})

// Side panel visibility - open by default
const sidePanelOpen = ref(true)

// Toggle side panel
const toggleSidePanel = () => {
  sidePanelOpen.value = !sidePanelOpen.value
}

// Shopping list preference dialog state
const showPreferenceDialog = ref(false)
const pendingInvoicedQuantities = ref<Record<string, number> | null>(null)

// Contract breakdown dialog state (shown after single invoice submission)
const showContractBreakdown = ref(false)
const submittedInvoice = ref<Invoice | null>(null)
const submittedInvoiceId = ref<number | null>(null)

// Submit All results dialog state
const showSubmitAllResults = ref(false)
const submitAllResults = ref<{ invoiceId: number; counterpartyName: string }[]>([])

// Apply invoice quantities to shopping list (reduce or remove items)
const applyInvoiceToShoppingList = (invoicedQuantities: Record<string, number>) => {
  const materials = shoppingListStore.workingMaterials.value
  if (!materials || Object.keys(invoicedQuantities).length === 0) return

  const updatedMaterials: Record<string, number> = { ...materials }
  let hasChanges = false

  for (const [ticker, invoicedQty] of Object.entries(invoicedQuantities)) {
    if (ticker in updatedMaterials) {
      const newQty = updatedMaterials[ticker] - invoicedQty
      if (newQty <= 0) {
        // Fulfilled - remove from list
        delete updatedMaterials[ticker]
      } else {
        // Partial - reduce quantity
        updatedMaterials[ticker] = newQty
      }
      hasChanges = true
    }
  }

  if (hasChanges) {
    if (Object.keys(updatedMaterials).length === 0) {
      // All items fulfilled - clear the list
      shoppingListStore.clearList()
    } else {
      shoppingListStore.setMaterials(updatedMaterials)
    }
  }
}

// Handle preference dialog choice
const onPreferenceChoice = (autoUpdate: boolean) => {
  // Save the preference
  settingsStore.updateSetting('market.updateShoppingList', autoUpdate)

  // If auto-update enabled and we have pending quantities, apply them
  if (autoUpdate && pendingInvoicedQuantities.value) {
    applyInvoiceToShoppingList(pendingInvoicedQuantities.value)
  }
  pendingInvoicedQuantities.value = null

  // Show appropriate dialog after preference dialog closes
  if (submitAllResults.value.length > 0) {
    showSubmitAllResults.value = true
  } else {
    openContractBreakdown()
  }
}

// Fetch and show the contract breakdown dialog for a submitted invoice
const openContractBreakdown = async () => {
  if (!submittedInvoiceId.value) return
  try {
    submittedInvoice.value = await api.invoices.get(submittedInvoiceId.value)
    showContractBreakdown.value = true
  } catch (error) {
    console.error('Failed to load submitted invoice', error)
  }
}

const onInvoiceSubmitted = (invoiceId: number, invoicedQuantities: Record<string, number>) => {
  showSnackbar('Invoice submitted successfully!', 'success')
  loadMarketItems()

  // Store submitted invoice ID for contract breakdown dialog
  submittedInvoiceId.value = invoiceId

  // Check if we should update the shopping list
  const updateSetting = settingsStore.getSetting<boolean | null>('market.updateShoppingList')

  // Only update if there's an active shopping list and invoiced quantities
  const hasShoppingList = shoppingListStore.hasWorkingList.value
  const hasInvoicedItems = Object.keys(invoicedQuantities).length > 0

  let showingPreference = false
  if (hasShoppingList && hasInvoicedItems) {
    if (updateSetting === null) {
      // First time - show preference dialog (contract breakdown deferred to after choice)
      pendingInvoicedQuantities.value = invoicedQuantities
      showPreferenceDialog.value = true
      showingPreference = true
    } else if (updateSetting === true) {
      // Auto-update enabled - apply changes
      applyInvoiceToShoppingList(invoicedQuantities)
    }
    // If updateSetting === false, do nothing (keep list unchanged)
  }

  // Show contract breakdown immediately if no preference dialog
  if (!showingPreference) {
    openContractBreakdown()
  }
}

// Handle Submit All results
const onAllInvoicesSubmitted = (
  results: { invoiceId: number; counterpartyName: string }[],
  invoicedQuantities: Record<string, number>
) => {
  showSnackbar(`${results.length} invoice${results.length === 1 ? '' : 's'} submitted!`, 'success')
  loadMarketItems()

  // Handle shopping list update with aggregated quantities
  const updateSetting = settingsStore.getSetting<boolean | null>('market.updateShoppingList')
  const hasShoppingList = shoppingListStore.hasWorkingList.value
  const hasInvoicedItems = Object.keys(invoicedQuantities).length > 0

  if (hasShoppingList && hasInvoicedItems) {
    if (updateSetting === null) {
      pendingInvoicedQuantities.value = invoicedQuantities
      showPreferenceDialog.value = true
      // Store results to show after preference dialog
      submitAllResults.value = results
      return
    } else if (updateSetting === true) {
      applyInvoiceToShoppingList(invoicedQuantities)
    }
  }

  // Show results dialog
  submitAllResults.value = results
  showSubmitAllResults.value = true
}

// Open contract breakdown for a specific invoice from the Submit All results
const openContractForResult = async (invoiceId: number) => {
  try {
    submittedInvoice.value = await api.invoices.get(invoiceId)
    showContractBreakdown.value = true
  } catch (error) {
    console.error('Failed to load invoice', error)
  }
}

// Handle filter add from invoice panel (adds userName to filter)
const onFilterAdd = (userName: string) => {
  addFilterChip('userName', userName)
}

// Handle add-invoice from empty state - open counterparty selection dialog
const onAddInvoice = () => {
  newInvoiceDialog.value = true
}

// Handle filter-by-list from shopping list panel
const onFilterByList = () => {
  const materials = shoppingListStore.workingMaterials.value
  if (materials && Object.keys(materials).length > 0) {
    // Filter by commodities in the shopping list
    filters.value.commodity = Object.keys(materials)
    // Force sell-only when filtering by shopping list
    filters.value.itemType = 'sell'
  }
}

// Shopping list state for quantity requirements highlighting
// Note: listQuantities is kept for backwards compatibility with search chip sync
const listQuantities = ref<XitMaterials | null>(null)
const listName = ref<string | undefined>(undefined)
// Use store materials for isListActive check (combines search chips + manual adds)
const isListActive = computed(() => shoppingListStore.hasWorkingList.value)

// Key for data table to force re-render when shopping list changes
// This ensures row highlighting updates when shopping list is modified
const shoppingListKey = computed(() => {
  const materials = shoppingListStore.workingMaterials.value
  if (!materials) return 'list-empty'
  return `list-${Object.keys(materials).length}-${JSON.stringify(materials)}`
})

// Calculate remaining list need per commodity (requested - claimed)
// Uses store materials and claimed quantities from all loaded invoices
const remainingListNeeds = computed((): Record<string, number> => {
  const materials = shoppingListStore.workingMaterials.value
  if (!materials) return {}
  const claimed = invoicesStore.allClaimedQuantities.value
  const remaining: Record<string, number> = {}
  for (const [ticker, requested] of Object.entries(materials)) {
    const claimedQty = claimed[ticker] ?? 0
    remaining[ticker] = Math.max(0, requested - claimedQty)
  }
  return remaining
})

// Get shopping list quantity for a market item (remaining need, capped to available)
const getListQuantity = (item: MarketItem): number | null => {
  const materials = shoppingListStore.workingMaterials.value
  if (!materials || item.itemType !== 'sell') return null
  const remaining = remainingListNeeds.value[item.commodityTicker]
  if (remaining === undefined) return null
  // Cap to the available remaining quantity on this order
  return Math.min(remaining, item.remainingQuantity)
}

// Check if shopping list need for this item is fully satisfied
const isListSatisfied = (item: MarketItem): boolean => {
  const materials = shoppingListStore.workingMaterials.value
  if (!materials || item.itemType !== 'sell') return false
  const remaining = remainingListNeeds.value[item.commodityTicker]
  return remaining !== undefined && remaining === 0
}

// Check if item's commodity is on the shopping list (for showing "Your Order" indicator)
const isOnShoppingList = (item: MarketItem): boolean => {
  const materials = shoppingListStore.workingMaterials.value
  if (!materials || item.itemType !== 'sell') return false
  return item.commodityTicker in materials
}

// Shopping list availability status for each commodity
interface ListItemStatus {
  ticker: string
  requested: number
  claimed: number
  remaining: number
  availableInMarket: number
  orderCount: number
  ownOrderQuantity: number // Quantity available from user's own sell orders
  ordersNeeded: number // Minimum orders needed to fill (or all if can't fill)
  canFillCompletely: boolean // Whether orders can fully satisfy the remaining need
  status: 'fulfilled' | 'available' | 'partial' | 'unavailable'
}

// Calculate minimum orders needed to fill a quantity (greedy: pick largest first)
const calculateMinOrdersNeeded = (
  orderQuantities: number[],
  needed: number
): { ordersNeeded: number; canFill: boolean } => {
  if (needed <= 0) return { ordersNeeded: 0, canFill: true }
  if (orderQuantities.length === 0) return { ordersNeeded: 0, canFill: false }

  // Sort descending (largest first)
  const sorted = [...orderQuantities].sort((a, b) => b - a)

  let remaining = needed
  let count = 0
  for (const qty of sorted) {
    if (remaining <= 0) break
    remaining -= qty
    count++
  }

  return { ordersNeeded: count, canFill: remaining <= 0 }
}

const listAvailabilityStatus = computed((): ListItemStatus[] => {
  // Use store materials (includes both search chip additions and manual panel additions)
  const materials = shoppingListStore.workingMaterials.value
  if (!materials || Object.keys(materials).length === 0) return []

  const allClaimed = invoicesStore.allClaimedQuantities.value
  const statuses: ListItemStatus[] = []

  for (const [ticker, requested] of Object.entries(materials)) {
    const claimed = allClaimed[ticker] ?? 0
    const remaining = Math.max(0, requested - claimed)

    // Collect all order quantities for this commodity
    const orderQuantities: number[] = []
    let availableInMarket = 0
    let orderCount = 0
    let ownOrderQuantity = 0
    for (const item of marketItems.value) {
      if (item.itemType === 'sell' && item.commodityTicker === ticker) {
        if (item.isOwn) {
          ownOrderQuantity += item.remainingQuantity
        } else if (canReserveOrder(item)) {
          // Only count orders the user has permission to reserve
          availableInMarket += item.remainingQuantity
          orderQuantities.push(item.remainingQuantity)
          orderCount++
        }
      }
    }

    // Calculate minimum orders needed
    const { ordersNeeded, canFill } = calculateMinOrdersNeeded(orderQuantities, remaining)

    // Effective available = market total minus what's already claimed in invoices
    // (since claimed quantities come from those same orders)
    const effectiveAvailable = Math.max(0, availableInMarket - claimed)

    // Determine status
    let status: ListItemStatus['status']
    if (remaining === 0) {
      status = 'fulfilled' // Already have enough in invoice
    } else if (effectiveAvailable >= remaining) {
      status = 'available' // Can fully satisfy with remaining available orders
    } else if (effectiveAvailable > 0 || orderCount > 0) {
      status = 'partial' // Can partially satisfy OR orders exist but have 0 remaining
    } else {
      status = 'unavailable' // No orders available at all
    }

    statuses.push({
      ticker,
      requested,
      claimed,
      remaining,
      availableInMarket,
      orderCount,
      ownOrderQuantity,
      ordersNeeded,
      canFillCompletely: canFill,
      status,
    })
  }

  // Sort: unfulfilled first (unavailable, partial, available), then fulfilled
  // Items satisfied by own orders sort with fulfilled items
  const statusOrder: Record<ListItemStatus['status'], number> = {
    unavailable: 0,
    partial: 1,
    available: 2,
    fulfilled: 3,
  }
  const getEffectiveSortOrder = (item: ListItemStatus): number => {
    // If own order can satisfy the remaining need, sort with fulfilled
    if (item.ownOrderQuantity >= item.remaining) return statusOrder.fulfilled
    return statusOrder[item.status]
  }
  statuses.sort((a, b) => getEffectiveSortOrder(a) - getEffectiveSortOrder(b))

  return statuses
})

// Convert listAvailabilityStatus to ShoppingListPanel's expected format
const shoppingListPanelStatus = computed((): ShoppingListStatus[] => {
  return listAvailabilityStatus.value.map(item => ({
    ticker: item.ticker,
    needed: item.requested,
    available: item.availableInMarket,
    ownOrderQuantity: item.ownOrderQuantity,
    ordersNeeded: item.ordersNeeded,
    canFillCompletely: item.canFillCompletely,
    status: item.status,
  }))
})

// Handle shopping list clear
const onShoppingListClear = () => {
  listQuantities.value = null
  listName.value = undefined
  // Clear the shopping list chip from search
  tokenSearchRef.value?.clear()
  clearFilters()
}

// Whether the TokenSearchInput has any chips
const hasSearchChips = computed(() => searchChips.value.length > 0)

// Handle chip updates from TokenSearchInput
const onChipsUpdate = (chips: SearchChip[]) => {
  searchChips.value = chips

  // Extract filter values from chips for URL sync
  const commodities: string[] = []
  const locations: string[] = []
  const userNames: string[] = []
  let itemType: MarketItemType | null = null
  let listData: { materials: Record<string, number>; name?: string } | null = null

  for (const chip of chips) {
    switch (chip.type) {
      case 'commodity':
        commodities.push(chip.value)
        break
      case 'location':
        locations.push(chip.value)
        break
      case 'user':
        userNames.push(chip.value)
        break
      case 'itemType':
        itemType = chip.value as MarketItemType
        break
      case 'shoppingList':
        if (chip.shoppingListData) {
          listData = chip.shoppingListData
          // Add shopping list commodities to filter
          commodities.push(...Object.keys(chip.shoppingListData.materials))
          // Shopping list always forces sell-only
          itemType = 'sell'
        }
        break
    }
  }

  // Sync to URL filter params (chips are the source of truth for filtering)
  filters.value.commodity = commodities
  filters.value.location = locations
  filters.value.itemType = itemType
  filters.value.userName = userNames

  // Clear saved filter ref if user is modifying chips manually
  onFilterModified()

  // Update shopping list state - sync to store
  listQuantities.value = listData?.materials ?? null
  listName.value = listData?.name
  if (listData?.materials) {
    shoppingListStore.setMaterials(listData.materials, listData.name)
  } else {
    shoppingListStore.clearList()
  }
}

// Clear shopping list state when filters are cleared
const clearFiltersWithList = () => {
  clearFilters()
  tokenSearchRef.value?.clear()
  listQuantities.value = null
  listName.value = undefined
  shoppingListStore.clearList()
  currentSavedFilter.value = null
}

const visibilityOptions = [
  { title: 'Internal', value: 'internal' as OrderType },
  { title: 'Partner', value: 'partner' as OrderType },
]

const pricingOptions = computed(() => {
  const options: { title: string; value: string }[] = [{ title: 'Custom', value: 'custom' }]
  const priceLists = new Set(
    marketItems.value.filter(l => l.priceListCode).map(l => l.priceListCode!)
  )
  for (const code of Array.from(priceLists).sort()) {
    options.push({ title: code, value: code })
  }
  return options
})

// hasActiveFilters, clearFilters, and setFilter are provided by useUrlFilters

// Route chip-based filter clicks through the chip system instead of filters.value
const addFilterChip = (key: string, value: string) => {
  if (key === 'location') {
    tokenSearchRef.value?.addChip({ type: 'location', value, display: getLocationDisplay(value) })
  } else if (key === 'commodity') {
    tokenSearchRef.value?.addChip({ type: 'commodity', value, display: getCommodityDisplay(value) })
  } else if (key === 'itemType') {
    tokenSearchRef.value?.addChip({
      type: 'itemType',
      value,
      display: value === 'sell' ? 'Sell' : 'Buy',
    })
  } else if (key === 'userName') {
    tokenSearchRef.value?.addChip({ type: 'user', value, display: value })
  } else {
    setFilter(key, value)
  }
}

const filteredItems = computed(() => {
  let result = marketItems.value

  // Chip-based filters (commodity, location, itemType, user — chips are source of truth)
  const chipItemType = searchChips.value.find(c => c.type === 'itemType')?.value
  if (chipItemType) {
    result = result.filter(l => l.itemType === chipItemType)
  }
  const chipCommodities = searchChips.value.filter(c => c.type === 'commodity').map(c => c.value)
  if (chipCommodities.length > 0) {
    result = result.filter(l => chipCommodities.includes(l.commodityTicker))
  }
  const chipLocations = searchChips.value.filter(c => c.type === 'location').map(c => c.value)
  if (chipLocations.length > 0) {
    result = result.filter(l => chipLocations.includes(l.locationId))
  }
  const chipUsers = searchChips.value.filter(c => c.type === 'user').map(c => c.value)
  if (chipUsers.length > 0) {
    result = result.filter(l => chipUsers.includes(l.userName))
  }

  // Panel-only filters (category, orderType, pricing — no chip types for these)
  if (filters.value.category) {
    result = result.filter(l => getCommodityCategory(l.commodityTicker) === filters.value.category)
  }
  if (filters.value.orderType) {
    result = result.filter(l => l.orderType === filters.value.orderType)
  }
  if (filters.value.pricing) {
    if (filters.value.pricing === 'custom') {
      result = result.filter(l => l.pricingMode === 'fixed')
    } else {
      result = result.filter(l => l.priceListCode === filters.value.pricing)
    }
  }

  return result
})

// Compute which filtered commodities have no matching orders
const notFoundCommodities = computed(() => {
  const chipCommodities = searchChips.value.filter(c => c.type === 'commodity').map(c => c.value)
  if (chipCommodities.length === 0) return []

  // Get all commodity tickers that appear in the filtered results
  const foundTickers = new Set(filteredItems.value.map(item => item.commodityTicker))

  // Return filtered commodities that have no matching orders
  return chipCommodities.filter(ticker => !foundTickers.has(ticker))
})

const openOrderDialog = () => {
  orderDialogTab.value = 'buy'
  orderDialog.value = true
}

const viewOrder = (item: MarketItem) => {
  openOrder(item.itemType, item.id)
}

// Handler for row clicks on the data table
const onRowClick = (_event: Event, { item }: { item: MarketItem }) => {
  viewOrder(item)
}

// Handler for edit event from OrderDetailDialog
const onEditFromDetail = (orderType: 'sell' | 'buy', orderId: number) => {
  const item = marketItems.value.find(i => i.itemType === orderType && i.id === orderId)
  if (item) {
    openEditDialog(item)
  }
}

const openAddToInvoiceDialog = (item: MarketItem) => {
  addingToInvoiceItem.value = item
  // Priority: existing invoice quantity > XIT quantity (capped) > empty
  const existing = invoicesStore.activeInvoice.value?.lineItems.find(
    li =>
      (item.itemType === 'sell' && li.sellOrderId === item.id) ||
      (item.itemType === 'buy' && li.buyOrderId === item.id)
  )
  const listQty = getListQuantity(item)
  addToInvoiceQuantity.value = existing?.quantity ?? listQty ?? null
  addToInvoiceDialog.value = true
}

// Watch for add-to-invoice dialog open to focus the quantity input
// nextTick isn't enough for v-dialog - we need a short delay for the dialog to render
watch(addToInvoiceDialog, isOpen => {
  if (isOpen) {
    nextTick(() => {
      // Use a small timeout to ensure the dialog has fully rendered
      setTimeout(() => {
        invoiceQuantityInputRef.value?.focus()
      }, 50)
    })
  }
})

const confirmAddToInvoice = async () => {
  if (!addingToInvoiceItem.value || !addToInvoiceQuantity.value || addToInvoiceQuantity.value <= 0)
    return

  addingToInvoice.value = true
  const wasUpdating = isUpdatingExisting.value
  try {
    const item = addingToInvoiceItem.value
    const request = {
      sellOrderId: item.itemType === 'sell' ? item.id : undefined,
      buyOrderId: item.itemType === 'buy' ? item.id : undefined,
      quantity: addToInvoiceQuantity.value,
    }

    const result = await invoicesStore.addToActiveOrCreate(item.userId, request)
    if (result) {
      const actionText = wasUpdating ? 'Updated' : 'Added'
      const directionText = item.itemType === 'sell' ? 'buy from' : 'sell to'
      showSnackbar(
        `${actionText} ${addToInvoiceQuantity.value}x ${item.commodityTicker} in invoice (${directionText} ${item.userName})`
      )
      addToInvoiceDialog.value = false
      await loadMarketItems()
    } else {
      showSnackbar('Failed to update invoice', 'error')
    }
  } catch (error) {
    console.error('Failed to update invoice:', error)
    showSnackbar('Failed to update invoice', 'error')
  } finally {
    addingToInvoice.value = false
  }
}

const onOrderCreated = async (type: 'buy' | 'sell') => {
  showSnackbar(`${type === 'buy' ? 'Buy' : 'Sell'} order created successfully`)
  await loadMarketItems()
}

// Load suggested price for edit dialog
const loadEditSuggestedPrice = async () => {
  if (!editingItem.value) return
  const commodity = editingItem.value.commodityTicker
  const location = editingItem.value.locationId
  const currency = editForm.value.currency
  const priceList = settingsStore.defaultPriceList.value

  if (!commodity || !location || !currency || !priceList) {
    editSuggestedPrice.value = null
    return
  }

  try {
    loadingEditSuggestedPrice.value = true
    const prices = await api.prices.getEffective(priceList, location, currency)
    const price = prices.find((p: EffectivePrice) => p.commodityTicker === commodity)
    editSuggestedPrice.value = price ?? null
  } catch {
    editSuggestedPrice.value = null
  } finally {
    loadingEditSuggestedPrice.value = false
  }
}

const openEditDialog = (item: MarketItem) => {
  editingItem.value = item
  const usePriceList = item.pricingMode === 'dynamic' && item.priceListCode !== null
  editForm.value = {
    price: item.price,
    currency: item.currency,
    orderType: item.orderType,
    quantity: item.quantity,
    usePriceList,
    priceListCode: item.priceListCode,
  }
  editSuggestedPrice.value = null
  editDialog.value = true
  // Load suggested price if user has a default price list
  if (settingsStore.defaultPriceList.value) {
    loadEditSuggestedPrice()
  }
}

// Toggle automatic pricing in edit form
const toggleEditPricing = (enable: boolean) => {
  editForm.value.usePriceList = enable
  if (enable) {
    editForm.value.priceListCode = settingsStore.defaultPriceList.value
    editForm.value.price = 0
  } else {
    editForm.value.priceListCode = null
    // Keep the existing price or set a default
    if (editForm.value.price === 0 && editingItem.value) {
      // If switching from dynamic to custom, use effective price if available
      editForm.value.price = editingItem.value.effectivePrice ?? 1
    }
  }
}

const saveEdit = async () => {
  if (!editingItem.value) return

  const { valid } = await editFormRef.value.validate()
  if (!valid) return

  try {
    saving.value = true
    const priceListCode = editForm.value.usePriceList ? editForm.value.priceListCode : null
    const price = editForm.value.usePriceList ? 0 : editForm.value.price

    if (editingItem.value.itemType === 'sell') {
      await api.sellOrders.update(editingItem.value.id, {
        price,
        currency: editForm.value.currency,
        orderType: editForm.value.orderType,
        priceListCode,
      })
    } else {
      await api.buyOrders.update(editingItem.value.id, {
        price,
        currency: editForm.value.currency,
        orderType: editForm.value.orderType,
        quantity: editForm.value.quantity,
        priceListCode,
      })
    }
    showSnackbar('Order updated successfully')
    editDialog.value = false
    await loadMarketItems()
  } catch (error) {
    console.error('Failed to update order', error)
    const message = error instanceof Error ? error.message : 'Failed to update order'
    showSnackbar(message, 'error')
  } finally {
    saving.value = false
  }
}

const openDeleteDialog = (item: MarketItem) => {
  deletingItem.value = item
  deleteDialog.value = true
}

const confirmDelete = async () => {
  if (!deletingItem.value) return

  try {
    deleting.value = true
    if (deletingItem.value.itemType === 'sell') {
      await api.sellOrders.delete(deletingItem.value.id)
    } else {
      await api.buyOrders.delete(deletingItem.value.id)
    }
    showSnackbar('Order deleted successfully')
    deleteDialog.value = false
    await loadMarketItems()
  } catch (error) {
    console.error('Failed to delete order', error)
    const message = error instanceof Error ? error.message : 'Failed to delete order'
    showSnackbar(message, 'error')
  } finally {
    deleting.value = false
  }
}

// Keyboard shortcut: / to focus search
const handleGlobalKeydown = (event: globalThis.KeyboardEvent) => {
  // Ignore if already in an input/textarea/contenteditable
  const target = event.target as globalThis.HTMLElement
  if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
    return
  }

  if (event.key === '/') {
    event.preventDefault()
    tokenSearchRef.value?.focus()
  }
}

// Clear saved filter reference when user modifies filters manually
// (chips is the reactive source for commodity/location/itemType/user)
// We don't watch filters.value directly since onChipsUpdate writes there too

const onFilterModified = () => {
  if (currentSavedFilter.value) {
    currentSavedFilter.value = null
  }
}

// Saved filters functions

const loadPinnedFilters = async () => {
  try {
    pinnedFilters.value = await api.savedFilters.getPinned()
  } catch {
    // Silently ignore — pinned filters are non-critical
  }
}

const applyFilterData = (filterData: SavedMarketFilter['filterData']) => {
  // Apply chip-based fields by adding chips
  if (filterData.itemType) {
    tokenSearchRef.value?.addChip({
      type: 'itemType',
      value: filterData.itemType,
      display: filterData.itemType === 'buy' ? 'Buy' : 'Sell',
    })
  }
  for (const ticker of filterData.commodity ?? []) {
    tokenSearchRef.value?.addChip({
      type: 'commodity',
      value: ticker,
      display: getCommodityDisplay(ticker),
    })
  }
  for (const locId of filterData.location ?? []) {
    tokenSearchRef.value?.addChip({
      type: 'location',
      value: locId,
      display: getLocationDisplay(locId),
    })
  }
  for (const user of filterData.userName ?? []) {
    tokenSearchRef.value?.addChip({
      type: 'user',
      value: user,
      display: user,
    })
  }
  // Apply panel-only fields
  if (filterData.category) filters.value.category = filterData.category
  if (filterData.orderType) filters.value.orderType = filterData.orderType
  if (filterData.pricing) filters.value.pricing = filterData.pricing
}

const applySavedFilter = (savedFilter: SavedMarketFilter) => {
  // Clear current state first
  clearFiltersWithList()
  nextTick(() => {
    applyFilterData(savedFilter.filterData)
    currentSavedFilter.value = savedFilter
  })
}

const loadSavedFilterFromUrl = async (id: number) => {
  try {
    const saved = await api.savedFilters.get(id)
    // Remove the ?filter=ID param from URL (replace with actual filter params)
    const query = { ...route.query }
    delete query.filter
    router.replace({ query })
    // Apply the saved filter
    applyFilterData(saved.filterData)
    currentSavedFilter.value = saved
  } catch {
    showSnackbar('Saved filter not found or not accessible', 'error')
  }
}

const getCurrentFilterData = (): SavedMarketFilter['filterData'] => {
  return {
    itemType:
      (searchChips.value.find(c => c.type === 'itemType')?.value as 'sell' | 'buy') || undefined,
    commodity: searchChips.value.filter(c => c.type === 'commodity').map(c => c.value),
    location: searchChips.value.filter(c => c.type === 'location').map(c => c.value),
    userName: searchChips.value.filter(c => c.type === 'user').map(c => c.value),
    category: filters.value.category ?? undefined,
    orderType: filters.value.orderType ?? undefined,
    pricing: filters.value.pricing ?? undefined,
  }
}

const onFilterSaved = (savedFilter: SavedMarketFilter) => {
  currentSavedFilter.value = savedFilter
  loadPinnedFilters()
}

const copyFilterLink = (filterId: number) => {
  const url = `${window.location.origin}/market?filter=${filterId}`
  navigator.clipboard.writeText(url).then(() => {
    showSnackbar('Filter link copied to clipboard', 'success')
  })
}

onMounted(() => {
  loadMarketItems()
  loadPinnedFilters()
  document.addEventListener('keydown', handleGlobalKeydown)

  // Initialize chips from URL filter params (for existing bookmark deep links)
  nextTick(() => {
    // Load saved filter from ?filter=ID URL param
    const filterId = route.query.filter
    if (filterId) {
      loadSavedFilterFromUrl(Number(filterId))
      return
    }

    // Convert URL filter params to chips (for commodity/location/itemType/userName).
    // Capture all values up-front — each addChip() triggers onChipsUpdate() which
    // overwrites filters.value, so reading lazily would lose later entries.
    const initialItemType = filters.value.itemType
    const initialCommodities = [...filters.value.commodity]
    const initialLocations = [...filters.value.location]
    const initialUserNames = [...filters.value.userName]

    if (initialItemType) {
      tokenSearchRef.value?.addChip({
        type: 'itemType',
        value: initialItemType,
        display: initialItemType === 'buy' ? 'Buy' : 'Sell',
      })
    }
    for (const ticker of initialCommodities) {
      tokenSearchRef.value?.addChip({
        type: 'commodity',
        value: ticker,
        display: getCommodityDisplay(ticker),
      })
    }
    for (const locId of initialLocations) {
      tokenSearchRef.value?.addChip({
        type: 'location',
        value: locId,
        display: getLocationDisplay(locId),
      })
    }
    for (const userName of initialUserNames) {
      tokenSearchRef.value?.addChip({
        type: 'user',
        value: userName,
        display: userName,
      })
    }
  })
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleGlobalKeydown)
})
</script>

<style scoped>
/* Side panel styles */
.side-panel-drawer :deep(.v-navigation-drawer__content) {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.side-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 8px 8px 16px;
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  flex-shrink: 0;
}

.side-panel-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  overflow: hidden;
}

.search-shortcut {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  font-family: ui-monospace, monospace;
  font-size: 12px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.6);
  background: rgba(var(--v-theme-on-surface), 0.08);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.15);
  border-radius: 4px;
  cursor: default;
}

.filter-link {
  color: inherit;
  text-decoration: none;
  transition: color 0.2s;
}

.filter-link:hover {
  color: rgb(var(--v-theme-primary));
  text-decoration: underline;
}

.clickable-chip {
  cursor: pointer;
  transition: opacity 0.2s;
}

.clickable-chip:hover {
  opacity: 0.8;
}

/* Column width constraints */
.col-commodity {
  max-width: 100px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-location {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>

<style>
/* Non-scoped to target v-data-table rows */
.clickable-rows tbody tr {
  cursor: pointer;
}

.clickable-rows tbody tr:hover {
  background-color: rgba(var(--v-theme-on-surface), 0.08) !important;
}

/* Larger row height when commodity icons are enabled */
.icon-rows tbody tr td {
  height: 64px !important;
}

.own-listing-row {
  background-color: rgba(var(--v-theme-info), 0.08) !important;
}

.alt-row {
  background-color: rgba(var(--v-theme-on-surface), 0.03) !important;
}

/* Ensure own-listing-row takes precedence over alt-row */
.own-listing-row.alt-row {
  background-color: rgba(var(--v-theme-info), 0.08) !important;
}

/* XIT quantity highlighting */
.list-row-success {
  background-color: rgba(var(--v-theme-success), 0.15) !important;
}

.list-row-warning {
  background-color: rgba(var(--v-theme-warning), 0.15) !important;
}

/* Ensure XIT highlighting takes precedence */
.list-row-success.alt-row,
.list-row-success.own-listing-row {
  background-color: rgba(var(--v-theme-success), 0.15) !important;
}

.list-row-warning.alt-row,
.list-row-warning.own-listing-row {
  background-color: rgba(var(--v-theme-warning), 0.15) !important;
}

/* Responsive borders for smaller screens (below lg breakpoint) */
@media (max-width: 1279px) {
  /* Left border for Buy/Sell type */
  .type-border-sell > td:nth-child(2) {
    border-left: 6px solid rgb(var(--v-theme-success)) !important;
  }
  .type-border-buy > td:nth-child(2) {
    border-left: 6px solid rgb(var(--v-theme-warning)) !important;
  }

  /* Right border for FIO age */
  .fio-border-success > td:last-child {
    border-right: 6px solid rgb(var(--v-theme-success)) !important;
  }
  .fio-border-default > td:last-child {
    border-right: 6px solid rgba(var(--v-theme-on-surface), 0.3) !important;
  }
  .fio-border-warning > td:last-child {
    border-right: 6px solid rgb(var(--v-theme-warning)) !important;
  }
  .fio-border-error > td:last-child {
    border-right: 6px solid rgb(var(--v-theme-error)) !important;
  }
  .fio-border-none > td:last-child {
    border-right: 6px solid rgba(var(--v-theme-on-surface), 0.12) !important;
  }

  /* Hide columns that should be hidden below lg breakpoint */
  .v-data-table th.col-hidden-below-lg,
  .v-data-table td.col-hidden-below-lg {
    display: none !important;
  }
}
</style>

<style>
/* Unscoped: align all filter inputs to same height */
.filter-row .v-field__input {
  min-height: 48px;
  padding-top: 12px;
  padding-bottom: 2px;
}
</style>
