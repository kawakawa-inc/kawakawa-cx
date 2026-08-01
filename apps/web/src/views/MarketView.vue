<template>
  <v-container fluid>
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

    <!-- Market Listings Table -->
    <v-card>
      <!-- Pinned filters + action row -->
      <v-card-text class="pa-2 pb-1">
        <div class="d-flex flex-wrap align-center ga-2">
          <!-- Pinned filter chips (inline, replacing PinnedFiltersBar) -->
          <template v-if="pinnedFilters.length > 0">
            <span class="text-caption text-medium-emphasis">Pinned:</span>
            <v-chip
              v-for="pf in pinnedFilters"
              :key="pf.id"
              size="small"
              color="purple"
              variant="tonal"
              prepend-icon="mdi-pin"
              class="cursor-pointer"
              @click="applySavedFilter(pf)"
            >
              {{ pf.name }}
            </v-chip>
            <v-divider vertical class="mx-1" style="height: 20px; align-self: center" />
          </template>

          <!-- Active saved filter chip -->
          <v-chip
            v-if="currentSavedFilter"
            size="small"
            color="purple"
            prepend-icon="mdi-bookmark"
            closable
            @click:close="dismissSavedFilter()"
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

          <v-spacer />
        </div>
      </v-card-text>
      <v-divider />
      <v-card-title class="d-flex align-center">
        <FilterMenu
          :commodity-options="commodityFilterOptions"
          :location-options="locationFilterOptions"
          :user-options="userFilterOptions"
          :category-options="categoryOptions"
          :pricing-options="pricingOptions"
          :order-type-options="visibilityOptions"
          :active-chips="searchChips"
          :active-category="filters.category"
          :active-pricing="filters.pricing"
          :active-order-type="filters.orderType"
          :active-availability="filters.availability"
          :current-filter-data="getCurrentFilterData()"
          :can-pin="canPinFilters"
          @select="onFilterMenuSelect"
          @apply="applySavedFilter"
          @copy-link="copyFilterLink"
          @saved="onFilterSaved"
          @pinned="loadPinnedFilters"
        />
        <TokenSearchInput
          ref="tokenSearchRef"
          :get-commodity-display="getCommodityDisplay"
          :get-location-display="getLocationDisplay"
          :get-commodity-name="getCommodityName"
          :available-user-names="userFilterOptions"
          :help-tokens="marketHelpTokens"
          history-key="market"
          placeholder="Search: COF, BEN, Buy, Sell..."
          class="flex-grow-1"
          :extra-suggestion-types="filterSuggestionTypes"
          :singular-types="['itemType', 'orderType', 'pricing', 'availability']"
          :chip-icon-by-type="{
            itemType: 'mdi-swap-horizontal',
            orderType: 'mdi-eye-outline',
            pricing: 'mdi-currency-usd',
            availability: 'mdi-package-variant',
            category: 'mdi-tag-outline',
          }"
          @update:chips="onChipsUpdate"
        />
        <!-- Save filter icon -->
        <v-btn
          icon="mdi-content-save-outline"
          variant="text"
          size="small"
          :color="(hasActiveFilters || hasSearchChips) && !currentSavedFilter ? 'grey' : 'grey'"
          :disabled="!(hasActiveFilters || hasSearchChips) || !!currentSavedFilter"
          title="Save current filter"
          class="ml-1"
          @click="showSaveFilterDialog = true"
        />
        <!-- Buy / Sell quick-create buttons -->
        <v-tooltip
          :disabled="canCreateAnyOrders"
          text="You do not have permission to create orders"
          location="bottom"
        >
          <template #activator="{ props: tooltipProps }">
            <span v-bind="tooltipProps" class="d-flex ga-1 ml-1">
              <v-btn
                color="warning"
                variant="text"
                size="small"
                :disabled="!canCreateAnyOrders"
                @click="openOrderDialog('buy')"
              >
                Buy
              </v-btn>
              <v-btn
                color="success"
                variant="text"
                size="small"
                :disabled="!canCreateAnyOrders"
                @click="openOrderDialog('sell')"
              >
                Sell
              </v-btn>
            </span>
          </template>
        </v-tooltip>
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
        v-model:expanded="expandedRows"
        :headers="headers"
        :items="filteredItems"
        :loading="loading"
        :items-per-page="25"
        :row-props="getRowProps"
        :item-value="
          item =>
            item.isCollapsed
              ? `${item.itemType}-group-${item.groupedOrderIds.join('-')}`
              : `${item.itemType}-${item.id}`
        "
        :class="['elevation-0', 'clickable-rows', { 'icon-rows': hasIcons }]"
        show-expand
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
            @click.stop.prevent="setFilter('category', getCommodityCategory(item.commodityTicker)!)"
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
          <v-tooltip v-if="item.isCollapsed" location="top">
            <template #activator="{ props: tooltipProps }">
              <span v-bind="tooltipProps" class="d-inline-flex align-center">
                <FioAgeChip :fio-uploaded-at="item.fioUploadedAt" />
                <v-icon size="x-small" class="ml-1 text-medium-emphasis">mdi-layers-outline</v-icon>
              </span>
            </template>
            <div>
              <div class="text-caption font-weight-medium mb-1">
                {{ item.groupedOrderIds.length }} orders collapsed
              </div>
              <div v-for="(fioTime, idx) in item.groupedFioTimes" :key="idx" class="text-caption">
                Order #{{ item.groupedOrderIds[idx] }}:
                {{ fioTime ? formatRelativeTime(fioTime) : '—' }}
              </div>
            </div>
          </v-tooltip>
          <FioAgeChip v-else :fio-uploaded-at="item.fioUploadedAt" />
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
          <v-tooltip v-if="item.isStanding" location="top">
            <template #activator="{ props }">
              <span v-bind="props" class="font-weight-medium text-info">&infin;</span>
            </template>
            <span>Standing order - unlimited quantity</span>
          </v-tooltip>
          <v-tooltip v-else location="top">
            <template #activator="{ props }">
              <span v-bind="props" class="font-weight-medium">
                {{
                  (item.itemType === 'sell'
                    ? item.aggregateRemainingQuantity
                    : item.remainingQuantity
                  ).toLocaleString()
                }}
              </span>
            </template>
            <div>
              <!-- For sell orders, show aggregate info if multiple storage types exist -->
              <template v-if="item.itemType === 'sell'">
                <div v-if="item.hasMultipleStorageTypes" class="text-caption text-info mb-1">
                  Total across all storage types at this location
                </div>
                <div>Total: {{ item.aggregateQuantity.toLocaleString() }}</div>
                <div v-if="item.aggregateQuantity !== item.aggregateRemainingQuantity">
                  Remaining: {{ item.aggregateRemainingQuantity.toLocaleString() }}
                </div>
                <!-- Show per-order breakdown if different from aggregate -->
                <template v-if="item.hasMultipleStorageTypes">
                  <v-divider class="my-1" />
                  <div class="text-caption text-medium-emphasis">
                    This order: {{ item.remainingQuantity.toLocaleString() }}
                    <span v-if="item.storageType">({{ item.storageType }})</span>
                  </div>
                </template>
              </template>
              <!-- For buy orders, show simple breakdown -->
              <template v-else>
                <div>Total: {{ item.quantity.toLocaleString() }}</div>
                <div v-if="item.reservedQuantity > 0">
                  Filled: {{ item.reservedQuantity.toLocaleString() }}
                </div>
                <div>Remaining: {{ item.remainingQuantity.toLocaleString() }}</div>
              </template>
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

        <template #item.invoice="{ item }">
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
            v-else-if="!item.isOwn && canInvoiceOrder(item)"
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
                v-if="!item.isOwn && canInvoiceOrder(item)"
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

        <!-- Hide the expand chevron entirely on rows with no active reservations.
             There's nothing to show, and the affordance implies content that isn't there. -->
        <template #item.data-table-expand="{ internalItem, isExpanded, toggleExpand }">
          <v-btn
            v-if="internalItem.raw.activeReservationCount > 0"
            icon
            size="small"
            variant="text"
            @click.stop="toggleExpand(internalItem)"
          >
            <v-icon>{{
              isExpanded(internalItem) ? 'mdi-chevron-down' : 'mdi-chevron-right'
            }}</v-icon>
          </v-btn>
        </template>

        <template #expanded-row="{ columns, item }">
          <tr class="market-expanded-row">
            <td :colspan="columns.length" class="pa-0">
              <OrderReservationsTable
                :order-id="item.id"
                :side="item.itemType === 'sell' ? 'sell' : 'buy'"
                @open-invoice="onOpenInvoiceFromExpand"
              />
            </td>
          </tr>
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
    <OrderDialog
      v-model="orderDialog"
      :initial-tab="orderDialogTab"
      :initial-commodity="orderInitialCommodity"
      :initial-location="orderInitialLocation"
      @created="onOrderCreated"
      @edit="onEditFromDetail"
    />

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
              :rules="[v => editForm.isStanding || v > 0 || 'Quantity must be positive']"
              :disabled="editForm.isStanding"
              :hint="editForm.isStanding ? 'Standing order - unlimited quantity' : ''"
              :persistent-hint="editForm.isStanding"
              class="mb-2"
            />

            <!-- Standing Order Toggle (only for buy orders) -->
            <v-checkbox
              v-if="editingItem?.itemType === 'buy'"
              v-model="editForm.isStanding"
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
                    >Always buying - no quantity limit. Sellers can sell any amount to you.</span
                  >
                </v-tooltip>
              </template>
            </v-checkbox>

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
            @keyup.enter="onInvoiceQuantityEnter"
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
      :grouped-order-ids="orderDetailGroupIds"
      @deleted="loadMarketItems"
      @updated="loadMarketItems"
      @edit="onEditFromDetail"
    />

    <!-- Side Panel with Invoice and Shopping List (slides in from right) -->
    <v-navigation-drawer
      v-model="sidePanelOpen"
      location="right"
      width="370"
      :scrim="false"
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
              @add="onShoppingListAdd"
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
import { locationService } from '../services/locationService'
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
import OrderReservationsTable from '../components/OrderReservationsTable.vue'
import PriceListDisplay from '../components/PriceListDisplay.vue'
import ConfirmationDialog from '../components/ConfirmationDialog.vue'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'
import FioAgeChip from '../components/FioAgeChip.vue'
import OrderTypeChip from '../components/OrderTypeChip.vue'
import PricingModeChip from '../components/PricingModeChip.vue'
import CommodityDisplay from '../components/CommodityDisplay.vue'
import TokenSearchInput, {
  type SearchChip,
  type HelpToken,
} from '../components/TokenSearchInput.vue'
import InvoiceSummaryPanel from '../components/invoices/InvoiceSummaryPanel.vue'
import InvoiceDetailDialog from '../components/invoices/InvoiceDetailDialog.vue'
import ResizableSplitPanel from '../components/ResizableSplitPanel.vue'
import ShoppingListPanel, {
  type ListItemStatus as ShoppingListStatus,
} from '../components/ShoppingListPanel.vue'
import ShoppingListPreferenceDialog from '../components/ShoppingListPreferenceDialog.vue'
import SaveFilterDialog from '../components/SaveFilterDialog.vue'
import FilterMenu from '../components/FilterMenu.vue'
import { localizeMaterialCategory } from '../utils/materials'
import { getLocationCategoryPriority } from '../utils/locationUtils'
import { useShoppingListStore } from '../stores/shoppingList'
import type { CommodityCategory, SavedFilterData } from '@kawakawa/types'
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
const { getFioAgeColor, formatRelativeTime } = useFormatters()

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
    key: 'invoice',
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

const marketHelpTokens: HelpToken[] = [
  {
    label: 'Commodity',
    color: 'primary',
    example: 'COF',
    description: 'A ticker or material name. Prefix with `commodity:` to force commodity match.',
  },
  {
    label: 'Location',
    color: 'secondary',
    example: 'Montem',
    description: 'Planet or station name / ID. Prefix with `location:` to disambiguate.',
  },
  {
    label: 'User',
    color: 'info',
    example: 'user:alice',
    description: 'Filter to listings posted by a specific corp member.',
  },
  {
    label: 'Type',
    color: 'success',
    example: 'buy',
    description: 'Use `buy` or `sell` to restrict to that side of the market.',
  },
  {
    label: 'Shopping list',
    color: 'purple',
    example: '{"version":"1",...}',
    description: 'Paste an XIT JSON or CSV shopping list to match everything on it at once.',
  },
]

// Saved filters state
const pinnedFilters = ref<SavedMarketFilter[]>([])
const currentSavedFilter = ref<SavedMarketFilter | null>(null)
const showSaveFilterDialog = ref(false)

// Check if user can pin filters
const canPinFilters = computed(() => userStore.hasPermission(PERMISSIONS.FILTERS_PIN))

const orderDialog = ref(false)
const orderDialogTab = ref<'buy' | 'sell'>('buy')
const orderInitialCommodity = ref<string | undefined>(undefined)
const orderInitialLocation = ref<string | undefined>(undefined)

// Expanded rows show per-order reservation details (OrderReservationsTable).
// Vuetify keys expanded rows by item-value; this view uses `${itemType}-${id}`.
const expandedRows = ref<string[]>([])

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

// Check permissions for invoicing
const canInvoiceInternal = computed(() =>
  userStore.hasPermission(PERMISSIONS.RESERVATIONS_PLACE_INTERNAL)
)
const canInvoicePartner = computed(() =>
  userStore.hasPermission(PERMISSIONS.RESERVATIONS_PLACE_PARTNER)
)

const canInvoiceOrder = (item: MarketItem): boolean => {
  if (item.isOwn) return false
  // Note: we allow invoicing even when remainingQuantity is 0 for made-to-order items
  if (item.orderType === 'internal') return canInvoiceInternal.value
  if (item.orderType === 'partner') return canInvoicePartner.value
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
  isStanding: false, // Only used for buy orders
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

// Add to Invoice dialog
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

// Available counterparties (all users with orders we can invoice - both buyers and sellers)
const counterpartyOptions = computed((): KeyValueItem[] => {
  const counterpartyMap = new Map<
    number,
    { userId: number; userName: string; orderCount: number }
  >()

  for (const item of marketItems.value) {
    // Include all orders we can invoice (not our own, with permission)
    if (!item.isOwn && canInvoiceOrder(item)) {
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
    category: { type: 'array' },
    location: { type: 'array' },
    userName: { type: 'array' },
    orderType: { type: 'string' },
    pricing: { type: 'string' },
    availability: { type: 'string' },
  },
})

// Guard to prevent circular sync when chips -> filters -> chips
let isUpdatingFromFilters = false

// Sync filters.value -> searchChips so the search bar reflects URL/panel state.
// Guarded to avoid re-triggering when chips -> filters flows fire.
const syncFiltersToChips = () => {
  if (isUpdatingFromFilters || !tokenSearchRef.value) return
  isUpdatingFromFilters = true
  const chips: SearchChip[] = []

  if (filters.value.itemType) {
    chips.push({
      type: 'itemType',
      value: filters.value.itemType,
      display: filters.value.itemType === 'buy' ? 'Buy' : 'Sell',
    })
  }
  for (const ticker of filters.value.commodity) {
    chips.push({
      type: 'commodity',
      value: ticker,
      display: getCommodityDisplay(ticker),
    })
  }
  for (const locId of filters.value.location) {
    chips.push({
      type: 'location',
      value: locId,
      display: getLocationDisplay(locId),
    })
  }
  for (const name of filters.value.userName) {
    chips.push({
      type: 'user',
      value: name,
      display: name,
    })
  }

  // Multi-select panel filters as chips
  for (const cat of filters.value.category) {
    const catName = localizeMaterialCategory(cat as CommodityCategory)
    chips.push({ type: 'category', value: cat, display: catName })
  }
  if (filters.value.orderType) {
    chips.push({
      type: 'orderType',
      value: filters.value.orderType,
      display: filters.value.orderType,
    })
  }
  if (filters.value.pricing) {
    chips.push({
      type: 'pricing',
      value: filters.value.pricing,
      display: filters.value.pricing === 'custom' ? 'Custom' : filters.value.pricing,
    })
  }
  if (filters.value.availability) {
    const labels: Record<string, string> = {
      available: 'Available',
      standing: 'Standing',
      'one-time': 'One-time',
    }
    chips.push({
      type: 'availability',
      value: filters.value.availability,
      display: labels[filters.value.availability] ?? filters.value.availability,
    })
  }

  tokenSearchRef.value.setChips(chips)
  isUpdatingFromFilters = false
}

watch(filters, syncFiltersToChips, { deep: true, immediate: true })
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

const categoryOptions = computed(() => {
  const categories = new Set<string>()
  for (const item of marketItems.value) {
    const cat = getCommodityCategory(item.commodityTicker)
    if (cat) categories.add(cat)
  }
  return Array.from(categories)
    .sort()
    .map(cat => ({
      title: localizeMaterialCategory(cat as CommodityCategory),
      value: cat,
    }))
})

// Options for FilterMenu
const commodityFilterOptions = computed(() => {
  const seen = new Set<string>()
  const options: { value: string; display: string }[] = []
  for (const item of marketItems.value) {
    if (!seen.has(item.commodityTicker)) {
      seen.add(item.commodityTicker)
      options.push({
        value: item.commodityTicker,
        display: getCommodityDisplay(item.commodityTicker),
      })
    }
  }
  return options.sort((a, b) => a.display.localeCompare(b.display))
})

const locationFilterOptions = computed(() => {
  const seen = new Set<string>()
  const options: {
    value: string
    display: string
    locationType?: string
    storageTypes?: string[]
  }[] = []
  for (const item of marketItems.value) {
    if (!seen.has(item.locationId)) {
      seen.add(item.locationId)
      options.push({
        value: item.locationId,
        display: getLocationDisplay(item.locationId),
        locationType: locationService.getLocationType(item.locationId) ?? undefined,
        storageTypes: locationService.getStorageTypes(item.locationId),
      })
    }
  }
  return options.sort((a, b) => {
    const diff =
      getLocationCategoryPriority(a.locationType, a.storageTypes) -
      getLocationCategoryPriority(b.locationType, b.storageTypes)
    return diff !== 0 ? diff : a.display.localeCompare(b.display)
  })
})

const userFilterOptions = computed(() => {
  const seen = new Set<string>()
  for (const item of marketItems.value) seen.add(item.userName)
  return Array.from(seen).sort()
})

// TokenSearchInput extra suggestion types for panel-only filters that now live as chips
const filterSuggestionTypes = computed(() => [
  {
    type: 'category' as const,
    typeLabel: 'Category',
    color: 'teal',
    options: categoryOptions.value.map(o => ({ value: o.value, display: o.title })),
  },
  {
    type: 'orderType' as const,
    typeLabel: 'Visibility',
    color: 'brown',
    options: visibilityOptions.map(o => ({ value: o.value, display: o.title })),
  },
  {
    type: 'pricing' as const,
    typeLabel: 'Pricing',
    color: 'deep-orange',
    options: pricingOptions.value.map(o => ({ value: o.value, display: o.title })),
  },
  {
    type: 'availability' as const,
    typeLabel: 'Availability',
    color: 'cyan',
    options: [
      { value: 'available', display: 'Available' },
      { value: 'standing', display: 'Standing' },
      { value: 'one-time', display: 'One-time' },
    ],
  },
])

const onFilterMenuSelect = ({ filterType, key }: { filterType: string; key: string }) => {
  // All filter types go directly to filters.value (single source of truth)
  if (filterType === 'itemType') {
    filters.value.itemType = filters.value.itemType === key ? null : key
  } else if (filterType === 'commodity') {
    setFilter('commodity', key)
  } else if (filterType === 'location') {
    setFilter('location', key)
  } else if (filterType === 'user') {
    setFilter('userName', key)
  } else if (filterType === 'category') {
    const current = filters.value.category
    if (current.includes(key)) {
      filters.value.category = current.filter(c => c !== key)
    } else {
      filters.value.category = [...current, key]
    }
  } else if (filterType === 'pricing') {
    filters.value.pricing = filters.value.pricing === key ? null : key
  } else if (filterType === 'orderType') {
    filters.value.orderType = filters.value.orderType === key ? null : key
  } else if (filterType === 'availability') {
    filters.value.availability = filters.value.availability === key ? null : key
  }
}

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
  const fulfilledTickers: string[] = []

  for (const [ticker, invoicedQty] of Object.entries(invoicedQuantities)) {
    if (ticker in updatedMaterials) {
      const newQty = updatedMaterials[ticker] - invoicedQty
      if (newQty <= 0) {
        // Fulfilled - remove from list
        delete updatedMaterials[ticker]
        fulfilledTickers.push(ticker)
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

  // Remove chips for fulfilled items if they're currently in the filter
  for (const ticker of fulfilledTickers) {
    const hasChip = filters.value.commodity.includes(ticker)
    if (hasChip) {
      tokenSearchRef.value?.removeChipByTypeValue('commodity', ticker)
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

// Open the contract-breakdown dialog for an arbitrary invoice id — used by the
// per-order expanded reservation rows when the user clicks an invoice link.
const onOpenInvoiceFromExpand = async (invoiceId: number) => {
  try {
    submittedInvoice.value = await api.invoices.get(invoiceId)
    showContractBreakdown.value = true
  } catch (e) {
    showSnackbar(
      e instanceof Error && e.message === 'Permission denied'
        ? "You don't have access to that invoice"
        : 'Failed to load invoice',
      'error'
    )
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

// Handle filter-by-list toggle from shopping list panel
// Enabling: add commodity chips for all list items + sell-only chip
// Disabling: remove commodity chips that match list items + sell chip
const onFilterByList = (enabled: boolean) => {
  const materials = shoppingListStore.workingMaterials.value
  if (!materials || Object.keys(materials).length === 0) return

  if (enabled) {
    // Skip adding chips for already-fulfilled items
    const fulfilledTickers = new Set(
      listAvailabilityStatus.value.filter(s => s.status === 'fulfilled').map(s => s.ticker)
    )
    for (const ticker of Object.keys(materials)) {
      if (fulfilledTickers.has(ticker)) continue
      if (!filters.value.commodity.includes(ticker)) {
        addFilterChip('commodity', ticker)
      }
    }
    if (!filters.value.itemType) {
      addFilterChip('itemType', 'sell')
    }
  } else {
    for (const ticker of Object.keys(materials)) {
      tokenSearchRef.value?.removeChipByTypeValue('commodity', ticker)
    }
    tokenSearchRef.value?.removeChipByTypeValue('itemType', 'sell')
  }
}

// When an item is added/restored to the list while the filter is active, add its chip too
const onShoppingListAdd = (ticker: string) => {
  const filterActive = filters.value.commodity.length > 0
  if (filterActive && !filters.value.commodity.includes(ticker)) {
    addFilterChip('commodity', ticker)
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
  // Cap to the available remaining quantity on this order, but never go below 0:
  // an oversold listing has remainingQuantity < 0, and we don't want that
  // negative value to surface on the Invoice button or as the dialog default.
  return Math.max(0, Math.min(remaining, item.remainingQuantity))
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
        } else if (canInvoiceOrder(item)) {
          // Only count orders the user has permission to invoice
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

// When list availability changes (e.g. invoice added/deleted), sync filter chips
// Remove commodity chips for newly fulfilled items, add chips for newly unfulfilled items
watch(
  () => listAvailabilityStatus.value.map(s => `${s.ticker}:${s.status}`).join(','),
  (newVal, oldVal) => {
    if (!newVal || !oldVal) return
    const syncEnabled = settingsStore.getSetting<boolean | null>(
      'market.syncFilterWithShoppingList'
    )
    if (!syncEnabled) return

    // Parse old statuses to detect transitions
    const oldStatuses = new Map<string, string>()
    for (const entry of oldVal.split(',')) {
      const [ticker, status] = entry.split(':')
      if (ticker && status) oldStatuses.set(ticker, status)
    }

    for (const item of listAvailabilityStatus.value) {
      const wasStatus = oldStatuses.get(item.ticker)

      if (item.status === 'fulfilled') {
        // Remove chip for newly fulfilled items
        const hasChip = filters.value.commodity.includes(item.ticker)
        if (hasChip) {
          tokenSearchRef.value?.removeChipByTypeValue('commodity', item.ticker)
        }
      } else if (wasStatus === 'fulfilled') {
        // Add chip back for items that are no longer fulfilled
        const hasChip = filters.value.commodity.includes(item.ticker)
        if (!hasChip) {
          addFilterChip('commodity', item.ticker)
        }
      }
    }
  }
)

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

// Handle chip updates from TokenSearchInput (user typing/removing chips)
const onChipsUpdate = (chips: SearchChip[]) => {
  searchChips.value = chips

  // When chips were set programmatically from syncFiltersToChips, skip the reverse sync
  if (isUpdatingFromFilters) return

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
      case 'category': {
        const current = filters.value.category
        if (current.includes(chip.value)) {
          filters.value.category = current.filter(c => c !== chip.value)
        } else {
          filters.value.category = [...current, chip.value]
        }
        break
      }
      case 'orderType':
        filters.value.orderType = chip.value
        break
      case 'pricing':
        filters.value.pricing = chip.value
        break
      case 'availability':
        filters.value.availability = chip.value
        break
    }
  }

  // Sync to URL filter params (chips are the source of truth for filtering)
  filters.value.commodity = commodities
  filters.value.location = locations
  filters.value.itemType = itemType
  filters.value.userName = userNames

  // Reset singular chip types not present in the remaining chips
  if (!chips.some(c => c.type === 'orderType')) filters.value.orderType = null
  if (!chips.some(c => c.type === 'pricing')) filters.value.pricing = null
  if (!chips.some(c => c.type === 'availability')) filters.value.availability = null

  // Clear saved filter ref if user is modifying chips manually
  onFilterModified()

  // Update shopping list state - sync to store
  // Only clear the store when the list was chip-driven (listQuantities non-null) and the chip is gone.
  // If the list is panel-managed (listQuantities === null), leave the store untouched.
  if (listData?.materials) {
    listQuantities.value = listData.materials
    listName.value = listData.name
    shoppingListStore.setMaterials(listData.materials, listData.name)
  } else if (listQuantities.value !== null) {
    listQuantities.value = null
    listName.value = undefined
    shoppingListStore.clearList()
  }
}

// Clear shopping list state when filters are cleared
const clearFiltersWithList = () => {
  clearFilters()
  const query = { ...route.query }
  if (query.filter) {
    delete query.filter
    router.replace({ query })
  }
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

// Add a filter value directly to filters.value (handles both chip and panel filter types).
// Search bar display is synced automatically via syncFiltersToChips watcher.
const addFilterChip = (key: string, value: string) => {
  if (key === 'commodity') {
    setFilter('commodity', value)
  } else if (key === 'location') {
    setFilter('location', value)
  } else if (key === 'itemType') {
    filters.value.itemType = filters.value.itemType === value ? null : (value as 'sell' | 'buy')
  } else if (key === 'userName') {
    setFilter('userName', value)
  } else if (key === 'availability') {
    filters.value.availability = filters.value.availability === value ? null : value
  } else {
    setFilter(key as 'category' | 'pricing' | 'orderType', value)
  }
}

const filteredItems = computed(() => {
  let result = marketItems.value

  // All filters read from filters.value (single source of truth, synced with URL)
  const {
    itemType,
    commodity,
    location,
    userName,
    category,
    orderType,
    pricing,
    availability: availFilter,
  } = filters.value

  if (itemType) {
    result = result.filter(l => l.itemType === itemType)
  }
  if (commodity.length > 0) {
    result = result.filter(l => commodity.includes(l.commodityTicker))
  }
  if (location.length > 0) {
    result = result.filter(l => location.includes(l.locationId))
  }
  if (userName.length > 0) {
    result = result.filter(l => userName.includes(l.userName))
  }
  if (category.length > 0) {
    result = result.filter(l => category.includes(getCommodityCategory(l.commodityTicker) ?? ''))
  }
  if (orderType) {
    result = result.filter(l => l.orderType === orderType)
  }
  if (pricing) {
    if (pricing === 'custom') {
      result = result.filter(l => l.pricingMode === 'fixed')
    } else {
      result = result.filter(l => l.priceListCode === pricing)
    }
  }
  if (availFilter === 'available') {
    result = result.filter(l => l.isStanding || l.remainingQuantity > 0)
  } else if (availFilter === 'standing') {
    result = result.filter(l => l.isStanding)
  } else if (availFilter === 'one-time') {
    result = result.filter(l => !l.isStanding && l.remainingQuantity > 0)
  }

  return result
})

// Compute which filtered commodities have no matching orders
const notFoundCommodities = computed(() => {
  const chipCommodities = filters.value.commodity
  if (chipCommodities.length === 0) return []

  // Get all commodity tickers that appear in the filtered results
  const foundTickers = new Set(filteredItems.value.map(item => item.commodityTicker))

  // Return filtered commodities that have no matching orders
  return chipCommodities.filter(ticker => !foundTickers.has(ticker))
})

const openOrderDialog = (type: 'buy' | 'sell') => {
  // If a user chip is present, open the invoice flow instead
  const userChip = searchChips.value.find(c => c.type === 'user')
  if (userChip) {
    const counterparty = counterpartyOptions.value.find(cp => cp.name === userChip.value)
    if (counterparty) {
      selectedCounterpartyId.value = counterparty.key
    }
    newInvoiceDialog.value = true
    return
  }

  // Pre-populate commodity/location from chips when unambiguous (exactly one chip of each type)
  const commodityChips = searchChips.value.filter(c => c.type === 'commodity')
  const locationChips = searchChips.value.filter(c => c.type === 'location')
  orderInitialCommodity.value = commodityChips.length === 1 ? commodityChips[0].value : undefined
  orderInitialLocation.value = locationChips.length === 1 ? locationChips[0].value : undefined
  orderDialogTab.value = type
  orderDialog.value = true
}

// State for viewing collapsed groups
const orderDetailGroupIds = ref<number[]>([])

const viewOrder = (item: MarketItem) => {
  if (item.isCollapsed) {
    // For collapsed rows, pass all grouped order IDs
    orderDetailGroupIds.value = item.groupedOrderIds
    openOrder(item.itemType, item.groupedOrderIds[0])
  } else {
    orderDetailGroupIds.value = []
    openOrder(item.itemType, item.id)
  }
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

// Submit on Enter from the quantity input — but guard the same way the button
// does (must have a positive quantity, must not already be submitting).
const onInvoiceQuantityEnter = () => {
  if (addingToInvoice.value || !addToInvoiceQuantity.value || addToInvoiceQuantity.value <= 0) {
    return
  }
  void confirmAddToInvoice()
}

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
    isStanding: item.isStanding ?? false,
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
        quantity: editForm.value.isStanding ? 0 : editForm.value.quantity,
        priceListCode,
        isStanding: editForm.value.isStanding,
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

const setSavedFilterUrl = (filterId: number | null) => {
  const query = { ...route.query }
  if (filterId != null) {
    query.filter = String(filterId)
  } else {
    delete query.filter
  }
  router.replace({ query })
}

let isDismissingSavedFilter = false

const onFilterModified = () => {
  if (isDismissingSavedFilter) return
  if (currentSavedFilter.value) {
    currentSavedFilter.value = null
    setSavedFilterUrl(null)
  }
}

/**
 * Remove chips/filters that a saved filter contributed, keeping any that
 * are also contributed by the shopping list sync (the only other bulk source).
 */
const removeSavedFilterChips = (filterData: SavedMarketFilter['filterData']) => {
  const materials = shoppingListStore.workingMaterials.value
  const listSyncActive =
    !!materials &&
    Object.keys(materials).length > 0 &&
    !!settingsStore.getSetting<boolean | null>('market.syncFilterWithShoppingList')

  // Remove commodity chips unless the shopping list also contributes them
  for (const ticker of filterData.commodity ?? []) {
    if (listSyncActive && ticker in materials!) continue
    tokenSearchRef.value?.removeChipByTypeValue('commodity', ticker)
  }

  // Remove location chips (shopping list doesn't contribute locations)
  for (const locId of filterData.location ?? []) {
    tokenSearchRef.value?.removeChipByTypeValue('location', locId)
  }

  // Remove user chips
  for (const user of filterData.userName ?? []) {
    tokenSearchRef.value?.removeChipByTypeValue('user', user)
  }

  // Remove itemType chip unless shopping list sync is active (it adds 'sell')
  if (filterData.itemType) {
    if (!(listSyncActive && filterData.itemType === 'sell')) {
      tokenSearchRef.value?.removeChipByTypeValue('itemType', filterData.itemType)
    }
  }

  // Clear panel-only filters that the saved filter set
  if (filterData.category) {
    filters.value.category = filters.value.category.filter(c => !filterData.category!.includes(c))
  }
  if (filterData.orderType && filters.value.orderType === filterData.orderType) {
    filters.value.orderType = null
  }
  if (filterData.pricing && filters.value.pricing === filterData.pricing) {
    filters.value.pricing = null
  }
  if (filterData.availability && filters.value.availability === filterData.availability) {
    filters.value.availability = null
  }
}

const dismissSavedFilter = () => {
  if (!currentSavedFilter.value) return
  isDismissingSavedFilter = true
  removeSavedFilterChips(currentSavedFilter.value.filterData)
  currentSavedFilter.value = null
  setSavedFilterUrl(null)
  isDismissingSavedFilter = false
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
  if (filterData.category) {
    filters.value.category = filterData.category
  }
  if (filterData.orderType) filters.value.orderType = filterData.orderType
  if (filterData.pricing) filters.value.pricing = filterData.pricing
  if (filterData.availability) filters.value.availability = filterData.availability
}

const applySavedFilter = (savedFilter: SavedMarketFilter) => {
  // Clear current state first
  clearFiltersWithList()
  nextTick(() => {
    applyFilterData(savedFilter.filterData)
    currentSavedFilter.value = savedFilter
    setSavedFilterUrl(savedFilter.id)
  })
}

const loadSavedFilterFromUrl = async (id: number) => {
  try {
    const saved = await api.savedFilters.get(id)
    applyFilterData(saved.filterData)
    currentSavedFilter.value = saved
  } catch {
    showSnackbar('Saved filter not found or not accessible', 'error')
    // Remove invalid ?filter param from URL
    const query = { ...route.query }
    delete query.filter
    router.replace({ query })
  }
}

const getCurrentFilterData = (): SavedMarketFilter['filterData'] => {
  return {
    itemType: (filters.value.itemType as 'sell' | 'buy') ?? undefined,
    commodity: filters.value.commodity.length > 0 ? [...filters.value.commodity] : undefined,
    location: filters.value.location.length > 0 ? [...filters.value.location] : undefined,
    userName: filters.value.userName.length > 0 ? [...filters.value.userName] : undefined,
    category: filters.value.category.length > 0 ? [...filters.value.category] : undefined,
    orderType: filters.value.orderType ?? undefined,
    pricing: filters.value.pricing ?? undefined,
    availability: (filters.value.availability as SavedFilterData['availability']) ?? undefined,
  }
}

const onFilterSaved = (savedFilter: SavedMarketFilter) => {
  currentSavedFilter.value = savedFilter
  setSavedFilterUrl(savedFilter.id)
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
