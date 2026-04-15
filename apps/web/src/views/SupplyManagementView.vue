<template>
  <v-container fluid>
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Settings & Sync Card -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row align="center">
          <v-col cols="auto" style="width: 180px">
            <v-text-field
              v-model.number="burnDays"
              label="Burn Days"
              type="number"
              min="0"
              density="compact"
              hide-details
              prepend-icon="mdi-fire"
              @update:model-value="saveSettingDebounced('supply.burnDays', $event)"
            />
          </v-col>
          <v-col cols="auto" style="width: 180px">
            <v-text-field
              v-model.number="repairDays"
              label="Repair Days"
              type="number"
              min="0"
              density="compact"
              hide-details
              prepend-icon="mdi-wrench"
              @update:model-value="saveSettingDebounced('supply.repairDays', $event)"
            />
          </v-col>
          <v-col cols="auto" class="d-flex align-center">
            <v-btn-toggle
              v-model="conditionMode"
              density="compact"
              variant="outlined"
              color="primary"
              mandatory
              @update:model-value="saveSettingDebounced('supply.conditionMode', $event)"
            >
              <v-btn size="small" class="px-2 settings-label-btn" :ripple="false">
                <v-icon size="small">mdi-wrench</v-icon>
                <span class="ml-1">Condition</span>
              </v-btn>
              <v-btn value="actual" size="small">Actual</v-btn>
              <v-btn value="max" size="small">Max</v-btn>
            </v-btn-toggle>
          </v-col>
          <v-col cols="auto" class="d-flex align-center">
            <v-btn-toggle
              v-model="stockMode"
              density="compact"
              variant="outlined"
              color="primary"
              mandatory
            >
              <v-btn size="small" class="px-2 settings-label-btn" :ripple="false">
                <v-icon size="small">mdi-package-variant</v-icon>
                <span class="ml-1">Stock</span>
              </v-btn>
              <v-btn value="included" size="small">Included</v-btn>
              <v-btn value="ignored" size="small">Ignored</v-btn>
            </v-btn-toggle>
          </v-col>
          <v-col cols="auto" class="ml-auto d-flex ga-2">
            <v-btn
              color="primary"
              variant="outlined"
              prepend-icon="mdi-earth"
              :loading="syncingPlanets"
              @click="syncPlanetsAndReload"
            >
              Sync Buildings
            </v-btn>
            <v-btn
              color="primary"
              prepend-icon="mdi-package-variant-closed"
              :loading="syncingInventory"
              @click="syncInventoryAndReload"
            >
              Sync Inventory
            </v-btn>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Loading -->
    <v-progress-linear v-if="loading" indeterminate class="mb-4" />

    <!-- Tabs (always visible once loaded) -->
    <template v-if="!loading">
      <v-tabs v-model="pageState.activeTab" class="mb-4">
        <v-tab value="planet">
          <v-icon start>mdi-warehouse</v-icon>
          Connections
        </v-tab>
        <v-tab value="material">
          <v-icon start>mdi-cube-outline</v-icon>
          Materials
        </v-tab>
        <v-tab value="lines">
          <v-icon start>mdi-link-variant</v-icon>
          Supply Lines
        </v-tab>
      </v-tabs>

      <v-tabs-window v-model="pageState.activeTab">
        <!-- Connections Tab -->
        <v-tabs-window-item value="planet">
          <!-- Location picker -->
          <div class="d-flex align-center ga-3 mb-4">
            <KeyValueAutocomplete
              :model-value="pageState.selectedLocation"
              :items="availableLocationItems"
              :favorites="settingsStore.favoritedLocations.value"
              label="Location"
              density="compact"
              hide-details
              style="max-width: 350px"
              @update:model-value="pageState.selectedLocation = ($event as string) ?? ''"
              @update:favorites="settingsStore.updateSetting('market.favoritedLocations', $event)"
            />
          </div>

          <!-- No supply lines state -->
          <v-card v-if="!dashboard || allLines.length === 0" class="mb-4">
            <v-card-text class="text-center py-8">
              <v-icon size="64" color="grey-lighten-1">mdi-link-variant-off</v-icon>
              <p class="text-h6 mt-4">No supply chain configured</p>
              <p class="text-body-2 text-medium-emphasis">
                Use the Supply Lines tab to set up material flows.
              </p>
            </v-card-text>
          </v-card>

          <!-- No location selected state -->
          <v-card v-else-if="!activeLocation" class="mb-4">
            <v-card-text class="text-center py-8">
              <v-icon size="64" color="grey-lighten-1">mdi-map-marker-question</v-icon>
              <p class="text-h6 mt-4">Select a location</p>
              <p class="text-body-2 text-medium-emphasis">
                Choose a location above to view its supply connections.
              </p>
            </v-card-text>
          </v-card>

          <!-- Single location view -->
          <template v-else>
            <div v-for="location in [activeLocation]" :key="location.locationId">
              <!-- Stock + Order cards -->
              <div
                class="stock-cards-container"
                :style="{ height: (sourceCardHeight[location.locationId] ?? 250) + 'px' }"
              >
                <v-row>
                  <!-- Left: Stock -->
                  <v-col cols="12" md="6">
                    <v-card
                      class="source-stock-card"
                      :style="stockMode === 'ignored' ? { opacity: 0.4 } : {}"
                    >
                      <v-card-text>
                        <div class="d-flex align-center mb-1">
                          <v-icon start size="small">mdi-package-variant</v-icon>
                          <span class="text-subtitle-2">Stock</span>
                          <v-spacer />
                          <v-icon size="small" class="mr-1 text-medium-emphasis">mdi-sort</v-icon>
                          <v-btn-toggle
                            v-model="sourceStockSort[location.locationId]"
                            density="compact"
                            variant="outlined"
                            color="primary"
                            mandatory
                          >
                            <v-btn value="name" size="x-small">Name</v-btn>
                            <v-btn value="category" size="x-small">Category</v-btn>
                            <v-btn value="amount" size="x-small">Amount</v-btn>
                          </v-btn-toggle>
                        </div>
                        <div class="d-flex align-center ga-1 mb-2 flex-wrap">
                          <v-btn
                            v-for="cat in getLocationCategories(location)"
                            :key="cat"
                            size="x-small"
                            :variant="
                              isSourceFilterActive(location.locationId, 'cat', cat, 'stock')
                                ? 'flat'
                                : 'outlined'
                            "
                            :color="
                              isSourceFilterActive(location.locationId, 'cat', cat, 'stock')
                                ? 'primary'
                                : undefined
                            "
                            @click="toggleSourceFilter(location.locationId, 'cat', cat, 'stock')"
                          >
                            <v-icon start size="small">{{ getCategoryIcon(cat) }}</v-icon>
                            {{ categoryLabel(cat) }}
                          </v-btn>
                          <v-divider vertical class="mx-1" />
                          <v-btn
                            v-for="st in getLocationStorageTypes(location)"
                            :key="st"
                            size="x-small"
                            :variant="
                              isSourceFilterActive(location.locationId, 'storage', st, 'stock')
                                ? 'flat'
                                : 'outlined'
                            "
                            :color="
                              isSourceFilterActive(location.locationId, 'storage', st, 'stock')
                                ? 'primary'
                                : undefined
                            "
                            @click="toggleSourceFilter(location.locationId, 'storage', st, 'stock')"
                          >
                            <v-icon start size="small">{{
                              st === 'STORE' ? 'mdi-earth' : 'mdi-warehouse'
                            }}</v-icon>
                            {{ st === 'STORE' ? 'Base' : 'WAR' }}
                          </v-btn>
                        </div>
                        <div class="d-flex flex-wrap ga-1">
                          <div
                            v-for="item in getSortedSourceStock(location)"
                            :key="item.ticker"
                            class="stock-icon-wrapper"
                          >
                            <CommodityIcon
                              v-if="item.commodity"
                              :commodity="item.commodity"
                              class="stock-icon"
                            />
                            <div v-else class="stock-icon stock-icon-fallback">
                              {{ item.ticker }}
                            </div>
                            <span class="stock-qty" :class="stockQtyClass(item, location)">
                              {{ item.quantity }}
                            </span>
                          </div>
                        </div>
                      </v-card-text>
                    </v-card>
                  </v-col>

                  <!-- Right: Needs -->
                  <v-col cols="12" md="6">
                    <v-card class="source-stock-card d-flex flex-column">
                      <v-card-text class="flex-grow-1 d-flex flex-column">
                        <div class="d-flex align-center ga-2 mb-1">
                          <v-icon start size="small">mdi-cart-outline</v-icon>
                          <span class="text-subtitle-2">Needs</span>
                          <v-spacer />
                          <v-select
                            v-model="sourceOrderPriceList[location.locationId]"
                            :items="priceLists"
                            item-title="name"
                            item-value="code"
                            label="Price List"
                            density="compact"
                            variant="underlined"
                            hide-details
                            clearable
                            style="max-width: 480px"
                          />
                        </div>
                        <div class="d-flex align-center ga-1 mb-2 flex-wrap">
                          <v-btn
                            v-for="cat in getLocationCategories(location)"
                            :key="cat"
                            size="x-small"
                            :variant="
                              isSourceFilterActive(location.locationId, 'cat', cat, 'order')
                                ? 'flat'
                                : 'outlined'
                            "
                            :color="
                              isSourceFilterActive(location.locationId, 'cat', cat, 'order')
                                ? 'primary'
                                : undefined
                            "
                            @click="toggleSourceFilter(location.locationId, 'cat', cat, 'order')"
                          >
                            <v-icon start size="small">{{ getCategoryIcon(cat) }}</v-icon>
                            {{ categoryLabel(cat) }}
                          </v-btn>
                          <v-divider vertical class="mx-1" />
                          <v-btn
                            v-for="st in getLocationStorageTypes(location)"
                            :key="st"
                            size="x-small"
                            :variant="
                              isSourceFilterActive(location.locationId, 'storage', st, 'order')
                                ? 'flat'
                                : 'outlined'
                            "
                            :color="
                              isSourceFilterActive(location.locationId, 'storage', st, 'order')
                                ? 'primary'
                                : undefined
                            "
                            @click="toggleSourceFilter(location.locationId, 'storage', st, 'order')"
                          >
                            <v-icon start size="small">{{
                              st === 'STORE' ? 'mdi-earth' : 'mdi-warehouse'
                            }}</v-icon>
                            {{ st === 'STORE' ? 'Base' : 'WAR' }}
                          </v-btn>
                          <v-spacer />
                          <v-btn
                            size="x-small"
                            variant="outlined"
                            prepend-icon="mdi-content-copy"
                            :disabled="getFilteredSourceGaps(location).length === 0"
                            @click="copySourceGapsCsv(location)"
                          >
                            CSV
                          </v-btn>
                          <v-btn
                            size="x-small"
                            variant="outlined"
                            prepend-icon="mdi-cart-plus"
                            :disabled="getFilteredSourceGaps(location).length === 0"
                            @click="createShoppingListFromGaps(location)"
                          >
                            Shopping List
                          </v-btn>
                        </div>
                        <div class="source-order-table flex-grow-1">
                          <v-table
                            v-if="getFilteredSourceGaps(location).length > 0"
                            density="compact"
                          >
                            <thead>
                              <tr>
                                <th>Material</th>
                                <th class="text-right">Price</th>
                                <th class="text-right">Qty</th>
                                <th class="text-right">Total</th>
                                <th class="text-right">Wt</th>
                                <th class="text-right">Vol</th>
                              </tr>
                            </thead>
                            <tbody>
                              <tr
                                v-for="item in getFilteredSourceGaps(location)"
                                :key="item.ticker"
                              >
                                <td>
                                  <CommodityDisplay :ticker="item.ticker" />
                                </td>
                                <td class="text-right text-medium-emphasis">
                                  <template v-if="getGapPrice(location, item.ticker) !== null">
                                    {{ formatPrice(getGapPrice(location, item.ticker)!) }}
                                    <span class="text-caption ml-1">
                                      {{ settingsStore.preferredCurrency.value }}
                                    </span>
                                  </template>
                                  <template v-else>–</template>
                                </td>
                                <td class="text-right text-error font-weight-medium">
                                  {{ item.gap }}
                                </td>
                                <td class="text-right">
                                  <template v-if="getGapPrice(location, item.ticker) !== null">
                                    {{
                                      formatPrice(getGapPrice(location, item.ticker)! * item.gap)
                                    }}
                                    <span class="text-caption text-medium-emphasis ml-1">
                                      {{ settingsStore.preferredCurrency.value }}
                                    </span>
                                  </template>
                                  <template v-else>–</template>
                                </td>
                                <td class="text-right text-medium-emphasis">
                                  {{ getItemWeight(item.ticker, item.gap) }}
                                  <span
                                    v-if="getItemWeight(item.ticker, item.gap) !== '–'"
                                    class="text-caption"
                                    >t</span
                                  >
                                </td>
                                <td class="text-right text-medium-emphasis">
                                  {{ getItemVolume(item.ticker, item.gap) }}
                                  <span
                                    v-if="getItemVolume(item.ticker, item.gap) !== '–'"
                                    class="text-caption"
                                    >m³</span
                                  >
                                </td>
                              </tr>
                            </tbody>
                            <tfoot>
                              <tr class="font-weight-medium">
                                <td>Total</td>
                                <td></td>
                                <td></td>
                                <td class="text-right">
                                  <template v-if="getSourceOrderTotal(location) !== null">
                                    {{ formatPrice(getSourceOrderTotal(location)!) }}
                                    <span class="text-caption ml-1">
                                      {{ settingsStore.preferredCurrency.value }}
                                    </span>
                                  </template>
                                  <template v-else>–</template>
                                </td>
                                <td class="text-right">
                                  {{ formatWeight(getSourceOrderWeight(location)) }}
                                  <span class="text-caption">t</span>
                                </td>
                                <td class="text-right">
                                  {{ formatVolume(getSourceOrderVolume(location)) }}
                                  <span class="text-caption">m³</span>
                                </td>
                              </tr>
                            </tfoot>
                          </v-table>
                          <div v-else class="text-center text-medium-emphasis py-4">
                            <v-icon size="small" class="mr-1">mdi-check-circle</v-icon>
                            All covered
                          </div>
                        </div>
                      </v-card-text>
                    </v-card>
                  </v-col>
                </v-row>
              </div>

              <!-- Draggable divider -->
              <div class="resize-handle" @mousedown="startResize($event, location.locationId)">
                <v-icon size="x-small" color="grey">mdi-drag-horizontal</v-icon>
              </div>

              <v-card flat class="mt-2" style="margin: 0 12px">
                <v-card-title class="d-flex align-center py-2 px-3">
                  <v-icon start size="small">mdi-swap-horizontal</v-icon>
                  <span class="text-subtitle-2">Connections</span>
                  <v-spacer />
                  <v-icon size="small" class="mr-1 text-medium-emphasis" style="font-size: 17.5px">mdi-sort</v-icon>
                  <v-btn-toggle
                    v-model="connectionSort"
                    density="compact"
                    variant="outlined"
                    color="primary"
                    mandatory
                    class="mr-2"
                  >
                    <v-btn value="name" size="x-small">Name</v-btn>
                    <v-btn value="system" size="x-small">System</v-btn>
                    <v-btn value="gaps" size="x-small">Gaps</v-btn>
                  </v-btn-toggle>
                  <v-btn size="x-small" variant="text" @click="expandAllConnections(location)">
                    Expand All
                  </v-btn>
                  <v-btn size="x-small" variant="text" @click="collapseAllConnections(location)">
                    Collapse All
                  </v-btn>
                </v-card-title>
                <v-expansion-panels
                  v-model="expandedConnections[location.locationId]"
                  variant="accordion"
                  multiple
                >
                  <v-expansion-panel v-for="conn in sortedConnections(location)" :key="conn.locationId">
                    <v-expansion-panel-title>
                      <div
                        class="planet-panel-row"
                        :style="{
                          gridTemplateColumns: maxConnectionNameWidth(location) + 'ch 1fr auto',
                        }"
                      >
                        <span class="font-weight-medium planet-name">
                          {{ getLocationDisplay(conn.locationId) }}
                        </span>

                        <!-- Inline material icons grouped by category -->
                        <div class="d-inline-flex align-center planet-icons">
                          <template v-for="cat in connectionCategories(conn)" :key="cat">
                            <v-icon
                              size="x-small"
                              :class="[
                                cat !== connectionCategories(conn)[0] ? 'ml-3' : '',
                                'cat-icon',
                              ]"
                              :title="categoryLabel(cat)"
                              @click.stop="toggleExpandedCat(conn.locationId, cat)"
                            >
                              {{ getCategoryIcon(cat) }}
                            </v-icon>
                            <span
                              class="mat-icons"
                              :class="{
                                'mat-icons-expanded': isCatExpanded(conn.locationId, cat),
                              }"
                            >
                              <CommodityIcon
                                v-for="item in connectionCategoryTickers(conn, cat)"
                                :key="item.ticker"
                                :commodity="item"
                                class="ml-1 panel-commodity-icon"
                              />
                            </span>
                          </template>
                        </div>

                        <div class="d-flex justify-end">
                          <v-chip
                            v-if="connectionGapCount(location, conn) > 0"
                            size="small"
                            color="error"
                          >
                            {{ connectionGapCount(location, conn) }} gaps
                          </v-chip>
                        </div>
                      </div>
                    </v-expansion-panel-title>
                    <v-expansion-panel-text>
                      <!-- Filters: Category + Storage Type -->
                      <div class="d-flex align-center ga-1 mb-2 flex-wrap">
                        <v-btn
                          v-for="cat in connectionCategories(conn)"
                          :key="cat"
                          size="x-small"
                          :variant="
                            isPlanetFilterActive(conn.locationId, 'cat', cat) ? 'flat' : 'outlined'
                          "
                          :color="
                            isPlanetFilterActive(conn.locationId, 'cat', cat)
                              ? 'primary'
                              : undefined
                          "
                          @click="togglePlanetFilter(conn.locationId, 'cat', cat)"
                        >
                          <v-icon start size="small">{{ getCategoryIcon(cat) }}</v-icon>
                          {{ categoryLabel(cat) }}
                        </v-btn>
                        <v-divider vertical class="mx-1" />
                        <v-btn
                          v-for="st in conn.storageTypes"
                          :key="st"
                          size="x-small"
                          :variant="
                            isPlanetFilterActive(conn.locationId, 'storage', st)
                              ? 'flat'
                              : 'outlined'
                          "
                          :color="
                            isPlanetFilterActive(conn.locationId, 'storage', st)
                              ? 'primary'
                              : undefined
                          "
                          @click="togglePlanetFilter(conn.locationId, 'storage', st)"
                        >
                          <v-icon start size="small">
                            {{ st === 'STORE' ? 'mdi-earth' : 'mdi-warehouse' }}
                          </v-icon>
                          {{ st === 'STORE' ? 'Base' : 'Warehouse' }}
                        </v-btn>
                      </div>

                      <!-- Connection detail table -->
                      <v-data-table
                        :headers="connectionDetailHeaders"
                        :items="getConnectionMaterials(location, conn)"
                        density="compact"
                        :items-per-page="-1"
                        hide-default-footer
                        class="elevation-0"
                      >
                        <template #item.ticker="{ item }">
                          <CommodityDisplay :ticker="item.ticker" />
                        </template>

                        <template #item.category="{ item }">
                          <div class="d-inline-flex align-center">
                            <v-icon
                              v-for="cat in item.categories"
                              :key="cat"
                              size="small"
                              class="mr-1"
                              :title="categoryLabel(cat)"
                            >
                              {{ getCategoryIcon(cat) }}
                            </v-icon>
                          </div>
                        </template>

                        <template #item.production="{ item }">
                          <span v-if="item.production !== '–'" class="text-success">
                            {{ item.production }}
                          </span>
                          <span v-else class="text-disabled">–</span>
                        </template>

                        <template #item.demand="{ item }">
                          <span v-if="item.demand !== '–'" class="text-warning">
                            {{ item.demand }}
                          </span>
                          <span v-else class="text-disabled">–</span>
                        </template>

                        <template #item.net="{ item }">
                          <span
                            v-if="item.net !== '–'"
                            :class="item.netValue > 0 ? 'text-success' : 'text-error'"
                          >
                            {{ item.netValue > 0 ? '+' : '-' }}{{ item.net }}
                          </span>
                          <span v-else class="text-disabled">–</span>
                        </template>

                        <template #item.importAmt="{ item }">
                          <span v-if="item.importAmt <= 0" class="text-disabled">–</span>
                          <span v-else :class="importColor(item)">
                            {{ item.importAmt }}
                          </span>
                        </template>

                        <template #item.exportAmt="{ item }">
                          <span v-if="item.exportAmt <= 0" class="text-disabled">–</span>
                          <span v-else :class="exportColor(item)">
                            {{ item.exportAmt }}
                          </span>
                        </template>

                        <template #no-data>
                          <div class="text-center py-2 text-medium-emphasis">No materials</div>
                        </template>
                      </v-data-table>
                    </v-expansion-panel-text>
                  </v-expansion-panel>
                </v-expansion-panels>
              </v-card>
            </div>
          </template>
        </v-tabs-window-item>

        <!-- Materials Tab -->
        <v-tabs-window-item value="material">
          <v-card>
            <v-data-table
              :headers="materialHeaders"
              :items="dashboard?.materials ?? []"
              :items-per-page="25"
              density="compact"
              class="elevation-0"
            >
              <template #item.ticker="{ item }">
                <span class="font-weight-medium">
                  <CommodityDisplay :ticker="item.ticker" />
                </span>
              </template>

              <template #item.gap="{ item }">
                <v-chip v-if="item.gap > 0" size="small" color="error">
                  {{ item.gap }}
                </v-chip>
                <span v-else class="text-success">0</span>
              </template>

              <template #item.locations="{ item }">
                <v-chip v-for="loc in item.locations" :key="loc" size="x-small" class="mr-1">
                  {{ getLocationDisplay(loc) }}
                </v-chip>
              </template>

              <template #no-data>
                <div class="text-center py-4 text-medium-emphasis">
                  No materials in supply chain
                </div>
              </template>
            </v-data-table>
          </v-card>
        </v-tabs-window-item>

        <!-- Supply Lines Tab -->
        <v-tabs-window-item value="lines">
          <v-card class="mb-3">
            <v-card-text>
              <!-- 1. Source -->
              <div class="d-flex align-center ga-2 mb-3">
                <v-chip size="small" variant="flat" color="blue" class="font-weight-medium">1</v-chip>
                <span class="text-body-2" style="min-width: 75px; color: rgb(var(--v-theme-blue))">
                  Source
                </span>
                <KeyValueAutocomplete
                  v-model="addForm.sourceLocationId"
                  :items="locationItems"
                  :favorites="settingsStore.favoritedLocations.value"
                  label="Location"
                  density="compact"
                  hide-details
                  clearable
                  :loading="loadingLocations"
                  style="flex: 1; max-width: 300px"
                  @update:favorites="
                    settingsStore.updateSetting('market.favoritedLocations', $event)
                  "
                />
                <v-btn-toggle
                  v-model="addForm.sourceStorageTypes"
                  multiple
                  density="compact"
                  variant="outlined"
                  color="primary"
                >
                  <v-btn value="STORE" size="small">
                    <v-icon start size="small">mdi-earth</v-icon>
                    Base
                  </v-btn>
                  <v-btn value="WAREHOUSE_STORE" size="small">
                    <v-icon start size="small">mdi-warehouse</v-icon>
                    WAR
                  </v-btn>
                </v-btn-toggle>
              </div>

              <!-- 2. Destination -->
              <div class="d-flex align-center ga-2 mb-3">
                <v-chip size="small" variant="flat" color="green" class="font-weight-medium">2</v-chip>
                <span class="text-body-2" style="min-width: 75px; color: rgb(var(--v-theme-green))">
                  Destination
                </span>
                <KeyValueAutocomplete
                  v-model="addForm.destinationPlanetId"
                  :items="locationItems"
                  :favorites="settingsStore.favoritedLocations.value"
                  label="Location"
                  density="compact"
                  hide-details
                  clearable
                  :loading="loadingLocations"
                  style="flex: 1; max-width: 300px"
                  @update:favorites="
                    settingsStore.updateSetting('market.favoritedLocations', $event)
                  "
                />
                <v-btn-toggle
                  v-model="addForm.destStorageTypes"
                  multiple
                  density="compact"
                  variant="outlined"
                  color="primary"
                >
                  <v-btn value="STORE" size="small">
                    <v-icon start size="small">mdi-earth</v-icon>
                    Base
                  </v-btn>
                  <v-btn value="WAREHOUSE_STORE" size="small">
                    <v-icon start size="small">mdi-warehouse</v-icon>
                    WAR
                  </v-btn>
                </v-btn-toggle>
              </div>

              <!-- 3. Add -->
              <div class="d-flex align-center ga-2 flex-wrap">
                <v-chip size="small" variant="outlined" class="font-weight-medium">3</v-chip>
                <span class="text-body-2 text-medium-emphasis" style="min-width: 75px">Add</span>
                <v-select
                  v-model="addForm.category"
                  :items="categoryOptions"
                  item-title="title"
                  item-value="value"
                  label="Category"
                  density="compact"
                  hide-details
                  style="max-width: 170px"
                >
                  <template #item="{ item, props: itemProps }">
                    <v-list-item v-bind="itemProps">
                      <template #prepend>
                        <v-icon size="small">{{ getCategoryIcon(item.value) }}</v-icon>
                      </template>
                    </v-list-item>
                  </template>
                  <template #selection="{ item }">
                    <v-icon size="small" class="mr-1">{{ getCategoryIcon(item.value) }}</v-icon>
                    {{ item.title }}
                  </template>
                </v-select>

                <!-- Material Opts: [All | picker] -->
                <v-btn
                  v-if="supportsAllMaterials"
                  size="small"
                  :variant="addForm.materialAll ? 'flat' : 'outlined'"
                  :color="addForm.materialAll ? 'primary' : undefined"
                  @click="addForm.materialAll = !addForm.materialAll"
                >
                  All
                </v-btn>
                <KeyValueAutocomplete
                  v-if="!addForm.materialAll"
                  v-model="addForm.addTicker"
                  :items="addForm.materialFiltered ? filteredCommodityItems : commodityItems"
                  :favorites="settingsStore.favoritedCommodities.value"
                  show-icons
                  label="Material"
                  density="compact"
                  hide-details
                  :loading="loadingCommodities"
                  style="min-width: 160px; max-width: 220px"
                  @update:favorites="
                    settingsStore.updateSetting('market.favoritedCommodities', $event)
                  "
                />
                <v-btn
                  v-if="!addForm.materialAll && supportsAllMaterials"
                  icon
                  size="x-small"
                  variant="text"
                  :color="addForm.materialFiltered ? 'primary' : undefined"
                  @click="addForm.materialFiltered = !addForm.materialFiltered"
                >
                  <v-icon size="small">mdi-filter</v-icon>
                  <v-tooltip activator="parent" location="top">
                    {{
                      addForm.materialFiltered
                        ? 'Showing detected materials — click for all'
                        : 'Showing all materials — click to filter'
                    }}
                  </v-tooltip>
                </v-btn>

                <!-- Storage Opts -->
                <v-btn-toggle
                  v-model="addForm.addStorageTypes"
                  multiple
                  density="compact"
                  variant="outlined"
                  color="primary"
                >
                  <v-btn value="STORE" size="small">
                    <v-icon start size="small">mdi-earth</v-icon>
                    Base
                  </v-btn>
                  <v-btn value="WAREHOUSE_STORE" size="small">
                    <v-icon start size="small">mdi-warehouse</v-icon>
                    Warehouse
                  </v-btn>
                </v-btn-toggle>

                <!-- Amount Opts: [Auto | input] -->
                <v-btn
                  v-if="supportsAutoAmount"
                  size="small"
                  :variant="addForm.amountAuto ? 'flat' : 'outlined'"
                  :color="addForm.amountAuto ? 'primary' : undefined"
                  @click="addForm.amountAuto = !addForm.amountAuto"
                >
                  Auto
                </v-btn>
                <v-text-field
                  v-if="!addForm.amountAuto"
                  v-model.number="addForm.addAmount"
                  type="number"
                  min="0"
                  label="Amount"
                  density="compact"
                  hide-details
                  style="max-width: 100px"
                />

                <!-- Add button -->
                <v-btn
                  size="small"
                  color="primary"
                  prepend-icon="mdi-plus"
                  :loading="bulkAdding || addingManualLine"
                  :disabled="!canAddLine"
                  @click="handleAdd"
                >
                  Add
                </v-btn>

                <v-spacer />

                <v-btn
                  v-if="!editMode"
                  size="small"
                  variant="outlined"
                  prepend-icon="mdi-pencil"
                  :disabled="filteredLines.length === 0"
                  @click="enterEditMode"
                >
                  Edit
                </v-btn>
                <template v-else>
                  <v-btn
                    size="small"
                    variant="outlined"
                    prepend-icon="mdi-close"
                    @click="exitEditMode"
                  >
                    Cancel
                  </v-btn>
                  <v-btn
                    size="small"
                    color="primary"
                    prepend-icon="mdi-content-save"
                    :loading="savingEdits"
                    :disabled="Object.keys(pendingEdits).length === 0"
                    @click="saveEdits"
                  >
                    Save
                  </v-btn>
                </template>
              </div>
            </v-card-text>
          </v-card>

          <!-- Search / filter bar -->
          <TokenSearchInput
            ref="linesSearchRef"
            placeholder="Filter supply lines... (material, location, category, storage)"
            :get-commodity-display="getCommodityDisplay"
            :get-location-display="getLocationDisplay"
            :get-commodity-name="getCommodityName"
            :extra-suggestion-types="linesExtraSuggestions"
            class="mb-3"
            @update:chips="onLinesSearchChipsUpdate"
          />

          <!-- Edit mode actions -->
          <div v-if="editMode" class="d-flex align-center ga-2 mb-3">
            <v-btn size="small" variant="text" @click="selectAllLines">Select All</v-btn>
            <v-btn
              size="small"
              variant="text"
              :disabled="selectedLineIds.length === 0"
              @click="selectedLineIds = []"
            >
              Clear Selection
            </v-btn>
            <v-spacer />
            <v-btn
              size="small"
              color="error"
              variant="outlined"
              prepend-icon="mdi-delete"
              :loading="clearing"
              :disabled="selectedLineIds.length === 0"
              @click="confirmClearAll = true"
            >
              Delete {{ selectedLineIds.length }} Selected
            </v-btn>
          </div>

          <!-- Lines table -->
          <v-data-table
            v-model="selectedLineIds"
            :headers="configHeaders"
            :items="filteredLines"
            :items-per-page="25"
            item-value="id"
            density="compact"
            class="elevation-0"
            :show-select="editMode"
          >
            <template #item.commodityTicker="{ item }">
              <a
                v-if="!editMode"
                class="text-decoration-none cell-link"
                @click="addFilterChip('commodity', item.commodityTicker, item.commodityTicker)"
              >
                <CommodityDisplay :ticker="item.commodityTicker" />
              </a>
              <CommodityDisplay v-else :ticker="item.commodityTicker" />
            </template>

            <template #item.sourceLocationId="{ item }">
              <a
                v-if="!editMode"
                class="text-decoration-none cell-link"
                @click="addFilterChip('source', item.sourceLocationId, getLocationDisplay(item.sourceLocationId))"
              >
                {{ getLocationDisplay(item.sourceLocationId) }}
              </a>
              <template v-else>{{ getLocationDisplay(item.sourceLocationId) }}</template>
            </template>

            <template #item.destinationPlanetId="{ item }">
              <a
                v-if="!editMode"
                class="text-decoration-none cell-link"
                @click="addFilterChip('destination', item.destinationPlanetId, getLocationDisplay(item.destinationPlanetId))"
              >
                {{ getLocationDisplay(item.destinationPlanetId) }}
              </a>
              <template v-else>{{ getLocationDisplay(item.destinationPlanetId) }}</template>
            </template>

            <template #item.srcStorage="{ item }">
              <span class="d-inline-flex">
                <v-icon
                  v-if="!editMode"
                  :style="{
                    visibility: (item.sourceStorageTypes as string[]).includes('WAREHOUSE_STORE')
                      ? 'visible'
                      : 'hidden',
                  }"
                  size="small"
                >
                  mdi-warehouse
                </v-icon>
                <v-icon
                  v-else
                  size="small"
                  :color="
                    (editedLine(item).sourceStorageTypes as string[]).includes('WAREHOUSE_STORE')
                      ? 'primary'
                      : 'grey-darken-1'
                  "
                  :style="{
                    opacity: (editedLine(item).sourceStorageTypes as string[]).includes(
                      'WAREHOUSE_STORE'
                    )
                      ? 1
                      : 0.3,
                    cursor: 'pointer',
                  }"
                  @click="toggleLineStorage(item, 'source', 'WAREHOUSE_STORE')"
                >
                  mdi-warehouse
                </v-icon>
                <v-icon
                  v-if="!editMode"
                  :style="{
                    visibility: (item.sourceStorageTypes as string[]).includes('STORE')
                      ? 'visible'
                      : 'hidden',
                  }"
                  size="small"
                  class="ml-1"
                >
                  mdi-earth
                </v-icon>
                <v-icon
                  v-else
                  size="small"
                  class="ml-1"
                  :color="
                    (editedLine(item).sourceStorageTypes as string[]).includes('STORE')
                      ? 'primary'
                      : 'grey-darken-1'
                  "
                  :style="{
                    opacity: (editedLine(item).sourceStorageTypes as string[]).includes('STORE')
                      ? 1
                      : 0.3,
                    cursor: 'pointer',
                  }"
                  @click="toggleLineStorage(item, 'source', 'STORE')"
                >
                  mdi-earth
                </v-icon>
              </span>
            </template>

            <template #item.destStorage="{ item }">
              <span class="d-inline-flex">
                <v-icon
                  v-if="!editMode"
                  :style="{
                    visibility: (item.destinationStorageTypes as string[]).includes(
                      'WAREHOUSE_STORE'
                    )
                      ? 'visible'
                      : 'hidden',
                  }"
                  size="small"
                >
                  mdi-warehouse
                </v-icon>
                <v-icon
                  v-else
                  size="small"
                  :color="
                    (editedLine(item).destinationStorageTypes as string[]).includes(
                      'WAREHOUSE_STORE'
                    )
                      ? 'primary'
                      : 'grey-darken-1'
                  "
                  :style="{
                    opacity: (editedLine(item).destinationStorageTypes as string[]).includes(
                      'WAREHOUSE_STORE'
                    )
                      ? 1
                      : 0.3,
                    cursor: 'pointer',
                  }"
                  @click="toggleLineStorage(item, 'destination', 'WAREHOUSE_STORE')"
                >
                  mdi-warehouse
                </v-icon>
                <v-icon
                  v-if="!editMode"
                  :style="{
                    visibility: (item.destinationStorageTypes as string[]).includes('STORE')
                      ? 'visible'
                      : 'hidden',
                  }"
                  size="small"
                  class="ml-1"
                >
                  mdi-earth
                </v-icon>
                <v-icon
                  v-else
                  size="small"
                  class="ml-1"
                  :color="
                    (editedLine(item).destinationStorageTypes as string[]).includes('STORE')
                      ? 'primary'
                      : 'grey-darken-1'
                  "
                  :style="{
                    opacity: (editedLine(item).destinationStorageTypes as string[]).includes(
                      'STORE'
                    )
                      ? 1
                      : 0.3,
                    cursor: 'pointer',
                  }"
                  @click="toggleLineStorage(item, 'destination', 'STORE')"
                >
                  mdi-earth
                </v-icon>
              </span>
            </template>

            <template #item.demandInfo="{ item }">
              <template v-if="!editMode">
                <a
                  v-if="item.lineSource"
                  class="text-decoration-none cell-link"
                  @click="addFilterChip('category', item.lineSource, categoryLabel(item.lineSource))"
                >
                  {{ categoryLabel(item.lineSource) }}
                </a>
                <template v-else>{{ categoryLabel(item.lineSource) }}</template>
              </template>
              <v-select
                v-else
                :model-value="editedLine(item).lineSource"
                :items="categoryOptions"
                item-title="title"
                item-value="value"
                density="compact"
                hide-details
                variant="plain"
                style="min-width: 120px"
                @update:model-value="updateLineField(item, 'lineSource', $event)"
              />
            </template>

            <template #item.demandMode="{ item }">
              <v-btn
                size="x-small"
                :disabled="!isAutoCategory(editMode ? editedLine(item).lineSource : item.lineSource)"
                :variant="(editMode ? editedLine(item).demand : item.demand) === null ? 'flat' : 'outlined'"
                :color="(editMode ? editedLine(item).demand : item.demand) === null ? 'primary' : undefined"
                @click="
                  editMode &&
                    (editedLine(item).demand === null
                      ? updateLineField(item, 'demand', 0)
                      : updateLineField(item, 'demand', null))
                "
              >
                {{ (editMode ? editedLine(item).demand : item.demand) === null ? 'Auto' : 'Manual' }}
              </v-btn>
            </template>

            <template #item.demandAmount="{ item }">
              <template v-if="!editMode">
                <span v-if="item.demand !== null">
                  {{ item.demand }}
                  <span class="text-caption text-disabled">{{
                    item.demandRate === 'daily' ? '/d' : ''
                  }}</span>
                </span>
                <span v-else-if="isAutoCategory(item.lineSource)" class="text-medium-emphasis">
                  {{ getCalculatedAmount(item) ?? '–' }}
                </span>
                <span v-else class="text-medium-emphasis">–</span>
              </template>
              <div v-else class="d-flex align-center ga-1">
                <span
                  v-if="editedLine(item).demand === null && isAutoCategory(editedLine(item).lineSource)"
                  class="text-medium-emphasis"
                >
                  {{ getCalculatedAmount(item) ?? '–' }}
                </span>
                <template v-if="editedLine(item).demand !== null || !isAutoCategory(editedLine(item).lineSource)">
                  <v-text-field
                    :model-value="editedLine(item).demand"
                    type="number"
                    min="0"
                    density="compact"
                    hide-details
                    variant="underlined"
                    style="width: 70px; flex: 0 0 70px"
                    @update:model-value="
                      updateLineField(item, 'demand', $event ? Number($event) : null)
                    "
                  />
                  <v-btn-toggle
                    :model-value="editedLine(item).demandRate ?? 'daily'"
                    density="compact"
                    variant="outlined"
                    color="primary"
                    mandatory
                    @update:model-value="updateLineField(item, 'demandRate', $event)"
                  >
                    <v-btn value="total" size="x-small">Total</v-btn>
                    <v-btn value="daily" size="x-small">/Day</v-btn>
                  </v-btn-toggle>
                </template>
              </div>
            </template>

            <template #no-data>
              <div class="text-center py-4 text-medium-emphasis">
                No supply lines configured yet. Use the controls above to add lines.
              </div>
            </template>
          </v-data-table>
        </v-tabs-window-item>
      </v-tabs-window>
    </template>

    <!-- Delete confirmation -->
    <v-dialog v-model="confirmClearAll" max-width="400">
      <v-card>
        <v-card-title>Delete Selected Lines?</v-card-title>
        <v-card-text>
          This will remove {{ selectedLineIds.length }} supply chain
          {{ selectedLineIds.length === 1 ? 'line' : 'lines' }}.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="confirmClearAll = false">Cancel</v-btn>
          <v-btn color="error" :loading="clearing" @click="deleteSelectedLines">Delete</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch, onMounted, nextTick } from 'vue'
import { api } from '../services/api'
import type {
  SupplyChainLineResponse,
  SupplyPlanetSummary,
  StorageLocationInfo,
} from '../services/api'
import type {
  SupplyDashboard,
  LocationDashboard,
  ConnectionDashboard,
  SupplyChainLineSource,
  DemandRate,
} from '@kawakawa/types'
import { useSnackbar, useDisplayHelpers, usePageState } from '../composables'
import { useRouter } from 'vue-router'
import { useUserStore } from '../stores/user'
import { useSettingsStore } from '../stores/settings'
import { useShoppingListStore } from '../stores/shoppingList'
import { locationService } from '../services/locationService'
import { commodityService } from '../services/commodityService'
import { localizeMaterial } from '../utils/materials'
import type { Commodity } from '../types'
import KeyValueAutocomplete, { type KeyValueItem } from '../components/KeyValueAutocomplete.vue'
import CommodityDisplay from '../components/CommodityDisplay.vue'
import CommodityIcon from '../components/CommodityIcon.vue'
import TokenSearchInput, {
  type SearchChip,
  type SearchChipType,
  type ExtraSuggestionType,
} from '../components/TokenSearchInput.vue'

const { snackbar, showSnackbar } = useSnackbar()
const { getLocationDisplay } = useDisplayHelpers()
const router = useRouter()
const userStore = useUserStore()
const settingsStore = useSettingsStore()
const shoppingListStore = useShoppingListStore()

// Persisted page state (localStorage)
interface SerializedChip {
  type: string
  value: string
  display: string
}
const { state: pageState } = usePageState('supply', {
  activeTab: 'planet' as string,
  selectedLocation: '' as string,
  expandedSources: [] as string[],
  sourceCardHeight: {} as Record<string, number>,
  sourceStockSort: {} as Record<string, string>,
  sourceOrderPriceList: {} as Record<string, string | null>,
  linesSearchChips: [] as SerializedChip[],
})

// State
const loading = ref(false)
const syncingInventory = ref(false)
const syncingPlanets = ref(false)
const bulkAdding = ref(false)
const clearing = ref(false)
const editMode = ref(false)
const selectedLineIds = ref<number[]>([])
const pendingEdits = reactive<
  Record<
    number,
    Partial<{
      sourceStorageTypes: string[]
      destinationStorageTypes: string[]
      lineSource: SupplyChainLineSource
      demand: number | null
      demandRate: DemandRate
    }>
  >
>({})
const savingEdits = ref(false)

/** Get the effective value for a line field, overlaying pending edits */
function editedLine(item: SupplyChainLineResponse) {
  const edits = pendingEdits[item.id]
  if (!edits) return item
  return { ...item, ...edits }
}
const dashboard = ref<SupplyDashboard | null>(null)

/** The currently viewed location from the dashboard */
const activeLocation = computed(
  () => dashboard.value?.locations.find(l => l.locationId === pageState.selectedLocation) ?? null
)

/** All location IDs that have supply lines touching them */
const availableLocationIds = computed(() => {
  const ids = new Set<string>()
  for (const line of allLines.value) {
    ids.add(line.sourceLocationId)
    ids.add(line.destinationPlanetId)
  }
  return ids
})

/** Auto-select a location: first favorite > most connections > none */
function autoSelectLocation() {
  if (pageState.selectedLocation && availableLocationIds.value.has(pageState.selectedLocation))
    return

  // Try first favorited location that has supply lines
  const favorites = settingsStore.favoritedLocations.value ?? []
  for (const fav of favorites) {
    if (availableLocationIds.value.has(fav)) {
      pageState.selectedLocation = fav
      return
    }
  }

  // Fall back to the location with the most connections (most lines touching it)
  const lineCounts = new Map<string, number>()
  for (const line of allLines.value) {
    lineCounts.set(line.sourceLocationId, (lineCounts.get(line.sourceLocationId) ?? 0) + 1)
    lineCounts.set(line.destinationPlanetId, (lineCounts.get(line.destinationPlanetId) ?? 0) + 1)
  }
  let bestId = ''
  let bestCount = 0
  for (const [id, count] of lineCounts) {
    if (count > bestCount) {
      bestId = id
      bestCount = count
    }
  }
  pageState.selectedLocation = bestId
}

const availableLocationItems = computed(() =>
  locationItems.value.filter(item => availableLocationIds.value.has(item.key))
)

// Reload dashboard when selected location changes
watch(
  () => pageState.selectedLocation,
  async newLoc => {
    if (!newLoc || loading.value) return
    try {
      loading.value = true
      dashboard.value = await api.supplyDashboard.get(newLoc)
    } catch {
      showSnackbar('Failed to load location data', 'error')
    } finally {
      loading.value = false
    }
  }
)
const allLines = ref<SupplyChainLineResponse[]>([])
const planets = ref<SupplyPlanetSummary[]>([])
const storageLocations = ref<StorageLocationInfo[]>([])
const locationItems = ref<KeyValueItem[]>([])
const planetItems = ref<KeyValueItem[]>([])
const loadingLocations = ref(false)
const commodityItems = ref<KeyValueItem[]>([])
const loadingCommodities = ref(false)
const addingManualLine = ref(false)
const confirmClearAll = ref(false)
const linesSearchRef = ref<InstanceType<typeof TokenSearchInput> | null>(null)
const linesSearchChips = ref<SearchChip[]>([])

// Settings
const burnDays = ref(7)
const repairDays = ref(0)
const conditionMode = ref<'actual' | 'max'>('max')
const stockMode = ref<'included' | 'ignored'>('included')

// Add form
const addForm = ref({
  sourceLocationId: '' as string,
  destinationPlanetId: '' as string,
  sourceStorageTypes: ['STORE'] as string[],
  destStorageTypes: ['STORE'] as string[],
  category: 'consumables' as string,
  materialAll: true as boolean,
  materialFiltered: true as boolean,
  addTicker: '' as string,
  addStorageTypes: ['STORE'] as string[],
  amountAuto: true as boolean,
  addAmount: null as number | null,
})

const categoryOptions = [
  { title: 'Consumables', value: 'consumables' },
  { title: 'Repair', value: 'repair' },
  { title: 'Inputs', value: 'inputs' },
  { title: 'Outputs', value: 'production_output' },
  { title: 'Government', value: 'government' },
  { title: 'Other', value: 'other' },
]

const CATEGORY_LABELS: Record<string, string> = {
  consumables: 'Consumables',
  repair: 'Repair',
  inputs: 'Inputs',
  production_output: 'Outputs',
  government: 'Government',
  other: 'Other',
}

const CATEGORY_ICONS: Record<string, string> = {
  consumables: 'mdi-fire',
  repair: 'mdi-wrench',
  inputs: 'mdi-factory',
  production_output: 'mdi-package-variant',
  government: 'mdi-bank',
  other: 'mdi-dots-horizontal',
}

function getCategoryIcon(cat: string): string {
  return CATEGORY_ICONS[cat] ?? 'mdi-dots-horizontal'
}

const AUTO_CATEGORIES = new Set(['consumables', 'repair', 'inputs', 'production_output'])
function isAutoCategory(cat: string | null | undefined): boolean {
  return !!cat && AUTO_CATEGORIES.has(cat)
}

// Search bar helpers for Supply Lines tab
const getCommodityDisplay = (ticker: string) => {
  const name = commodityService.getCommodityDisplay(ticker, 'name-only')
  return name !== ticker ? `${ticker} – ${localizeMaterial(name)}` : ticker
}
const getCommodityName = (ticker: string) =>
  localizeMaterial(commodityService.getCommodityDisplay(ticker, 'name-only'))

const linesExtraSuggestions = computed<ExtraSuggestionType[]>(() => [
  {
    type: 'category',
    typeLabel: 'Category',
    color: 'teal',
    options: categoryOptions.map(c => ({ value: c.value, display: c.title })),
  },
  {
    type: 'storage',
    typeLabel: 'Storage',
    color: 'orange',
    options: [
      { value: 'STORE', display: 'Base' },
      { value: 'WAREHOUSE_STORE', display: 'Warehouse' },
    ],
  },
])

// Suppress form→chip sync loops
let suppressFormSync = false

function onLinesSearchChipsUpdate(chips: SearchChip[]) {
  linesSearchChips.value = chips

  // Persist to page state
  pageState.linesSearchChips = chips.map(c => ({
    type: c.type,
    value: c.value,
    display: c.display,
  }))

  // If this callback was triggered by form→chip sync, skip the reverse sync
  if (suppressChipSync) return

  // Sync chips back to form fields (so add form stays in sync)
  suppressFormSync = true

  const sourceChip = chips.find(c => c.type === 'source')
  addForm.value.sourceLocationId = sourceChip?.value ?? ''

  const destChip = chips.find(c => c.type === 'destination')
  addForm.value.destinationPlanetId = destChip?.value ?? ''

  const categoryChip = chips.find(c => c.type === 'category')
  if (categoryChip) {
    addForm.value.category = categoryChip.value
  }

  const storageChips = chips.filter(c => c.type === 'storage')
  if (storageChips.length > 0) {
    addForm.value.destStorageTypes = storageChips.map(c => c.value)
  }

  suppressFormSync = false
}

const supportsAllMaterials = computed(() => AUTO_CATEGORIES.has(addForm.value.category))
const supportsAutoAmount = computed(() => AUTO_CATEGORIES.has(addForm.value.category))

// Cached detected tickers for (category, planetId). For production_output the
// relevant planet is the source (producing planet); for consumables/inputs/repair
// it is the destination planet.
const detectedTickers = ref<Set<string>>(new Set())
const detectedTickersKey = ref('')

function detectedTickerPlanet(cat: string): string {
  if (cat === 'production_output') return addForm.value.sourceLocationId
  return addForm.value.destinationPlanetId
}

watch(
  [
    () => addForm.value.category,
    () => addForm.value.sourceLocationId,
    () => addForm.value.destinationPlanetId,
  ],
  async ([cat]) => {
    const planetId = detectedTickerPlanet(cat)
    if (!AUTO_CATEGORIES.has(cat) || !planetId) {
      detectedTickers.value = new Set()
      detectedTickersKey.value = ''
      return
    }
    const key = `${cat}:${planetId}`
    if (key === detectedTickersKey.value) return
    try {
      const tickers = await api.supplyChain.getDetectedTickers(planetId, cat)
      detectedTickers.value = new Set(tickers)
      detectedTickersKey.value = key
    } catch {
      detectedTickers.value = new Set()
      detectedTickersKey.value = ''
    }
  },
  { immediate: true }
)

const filteredCommodityItems = computed(() => {
  if (!AUTO_CATEGORIES.has(addForm.value.category)) return commodityItems.value
  if (detectedTickers.value.size === 0) return commodityItems.value
  return commodityItems.value.filter(c => detectedTickers.value.has(c.key))
})

// Reset toggles when category changes
watch(
  () => addForm.value.category,
  cat => {
    if (AUTO_CATEGORIES.has(cat)) {
      addForm.value.materialAll = true
      addForm.value.amountAuto = true
    } else {
      addForm.value.materialAll = false
      addForm.value.amountAuto = false
    }
    addForm.value.addTicker = ''
    addForm.value.addAmount = null
  }
)

function getCalculatedAmount(line: SupplyChainLineResponse): number | null {
  if (!dashboard.value) return null
  for (const loc of dashboard.value.locations) {
    if (loc.locationId !== line.sourceLocationId) continue
    for (const conn of loc.connections) {
      if (conn.locationId !== line.destinationPlanetId) continue
      // Check exports (demand flowing out from source)
      const expMatch = conn.exports.find(
        e => e.ticker === line.commodityTicker && e.lineSource === line.lineSource
      )
      if (expMatch) return expMatch.amount
      // Check imports (supply flowing in to source)
      const impMatch = conn.imports.find(
        i => i.ticker === line.commodityTicker && i.lineSource === line.lineSource
      )
      if (impMatch) return impMatch.amount
    }
  }
  return null
}

function categoryLabel(source: string | null): string {
  if (!source) return '-'
  return CATEGORY_LABELS[source] ?? source
}

/** Add a filter chip if one with the same type+value doesn't already exist */
function addFilterChip(type: SearchChipType, value: string, display: string) {
  if (!linesSearchRef.value) return
  const exists = linesSearchChips.value.some(c => c.type === type && c.value === value)
  if (exists) return
  // For source/destination, also set the dropdown so chip↔form stay in sync
  if (type === 'source') {
    addForm.value.sourceLocationId = value
  } else if (type === 'destination') {
    addForm.value.destinationPlanetId = value
  } else {
    linesSearchRef.value.addChip({ type, value, display })
  }
}

// Computed

const canBulkAdd = computed(
  () => !!addForm.value.sourceLocationId && !!addForm.value.destinationPlanetId
)

const canAddLine = computed(() => {
  if (!canBulkAdd.value) return false
  if (addForm.value.addStorageTypes.length === 0) return false
  // Material: must have a ticker selected unless "All" is on
  if (!addForm.value.materialAll && !addForm.value.addTicker) return false
  // Amount: must have a value unless "Auto" is on
  if (!addForm.value.amountAuto && addForm.value.addAmount == null) return false
  return true
})

const filteredLines = computed(() => {
  let lines = allLines.value
  const chips = linesSearchChips.value

  // Location filtering: dropdowns take priority, then generic location chips
  // fill in whichever field the dropdown doesn't cover.
  const sourceId = addForm.value.sourceLocationId
  const destId = addForm.value.destinationPlanetId
  const locationChipIds = new Set(
    chips.filter(c => c.type === 'location').map(c => c.value)
  )

  if (sourceId) {
    lines = lines.filter(l => l.sourceLocationId === sourceId)
  }
  if (destId) {
    lines = lines.filter(l => l.destinationPlanetId === destId)
  }
  if (locationChipIds.size > 0) {
    if (!sourceId && !destId) {
      // Neither dropdown set: show lines where source OR destination matches
      lines = lines.filter(
        l => locationChipIds.has(l.sourceLocationId) || locationChipIds.has(l.destinationPlanetId)
      )
    } else if (!sourceId) {
      // Only destination set: location chips filter source
      lines = lines.filter(l => locationChipIds.has(l.sourceLocationId))
    } else if (!destId) {
      // Only source set: location chips filter destination
      lines = lines.filter(l => locationChipIds.has(l.destinationPlanetId))
    }
    // Both set: location chips are redundant, no extra filtering
  }

  // Commodity chips
  const commodityChips = chips.filter(c => c.type === 'commodity')
  if (commodityChips.length > 0) {
    const tickers = new Set(commodityChips.map(c => c.value))
    lines = lines.filter(l => tickers.has(l.commodityTicker))
  }

  // Category chip
  const categoryChip = chips.find(c => c.type === 'category')
  if (categoryChip) {
    lines = lines.filter(l => l.lineSource === categoryChip.value)
  }

  // Storage chips
  const storageChips = chips.filter(c => c.type === 'storage')
  if (storageChips.length > 0) {
    const selectedTypes = new Set(storageChips.map(c => c.value))
    lines = lines.filter(l =>
      (l.destinationStorageTypes as string[]).some(t => selectedTypes.has(t))
    )
  }

  return lines.map(l => ({
    ...l,
    effectiveAmount: l.demand ?? getCalculatedAmount(l) ?? 0,
    isAuto: l.demand === null,
  }))
})

// Pre-select detected storage types when location changes, keeping user selections if already set
watch(
  () => addForm.value.sourceLocationId,
  id => {
    const loc = storageLocations.value.find(l => l.locationId === id)
    if (loc && loc.storageTypes.length > 0) {
      addForm.value.sourceStorageTypes = [...loc.storageTypes]
    }
  }
)
watch(
  () => addForm.value.destinationPlanetId,
  id => {
    const loc = storageLocations.value.find(l => l.locationId === id)
    if (loc && loc.storageTypes.length > 0) {
      addForm.value.destStorageTypes = [...loc.storageTypes]
    }
  }
)
// Sync add-row storage toggle from the dest filter
watch(
  () => addForm.value.destStorageTypes,
  types => {
    addForm.value.addStorageTypes = [...types]
  },
  { immediate: true }
)

// Sync form fields → search chips (when dropdowns change, update the search bar)
// Must suppress the reverse sync (chips → form) to prevent feedback loops.
let suppressChipSync = false

watch(
  () => addForm.value.sourceLocationId,
  sourceId => {
    if (suppressFormSync || !linesSearchRef.value) return
    suppressChipSync = true
    const ref = linesSearchRef.value
    // Remove old source chip
    const existing = linesSearchChips.value.find(c => c.type === 'source')
    if (existing) {
      ref.removeChipByTypeValue('source', existing.value)
    }
    if (sourceId) {
      ref.addChip({ type: 'source', value: sourceId, display: getLocationDisplay(sourceId) })
    }
    nextTick(() => (suppressChipSync = false))
  }
)

watch(
  () => addForm.value.destinationPlanetId,
  destId => {
    if (suppressFormSync || !linesSearchRef.value) return
    suppressChipSync = true
    const ref = linesSearchRef.value
    // Remove old destination chip
    const existing = linesSearchChips.value.find(c => c.type === 'destination')
    if (existing) {
      ref.removeChipByTypeValue('destination', existing.value)
    }
    if (destId) {
      ref.addChip({ type: 'destination', value: destId, display: getLocationDisplay(destId) })
    }
    nextTick(() => (suppressChipSync = false))
  }
)

// Table headers
const materialHeaders = [
  { title: 'Material', key: 'ticker', sortable: true },
  { title: 'Export', key: 'totalExport', sortable: true, align: 'end' as const },
  { title: 'Import', key: 'totalImport', sortable: true, align: 'end' as const },
  { title: 'Need', key: 'totalNeed', sortable: true, align: 'end' as const },
  { title: 'Stock', key: 'stock', sortable: true, align: 'end' as const },
  { title: 'Gap', key: 'gap', sortable: true, align: 'end' as const },
  { title: 'Locations', key: 'locations', sortable: false },
]

const connectionDetailHeaders = [
  { title: 'Material', key: 'ticker', sortable: true },
  { title: 'Category', key: 'category', sortable: false, width: 80 },
  { title: 'Production', key: 'production', sortable: false },
  { title: 'Demand', key: 'demand', sortable: false },
  { title: 'Net', key: 'net', sortable: true },
  { title: 'Imports From', key: 'importAmt', sortable: true, align: 'end' as const },
  { title: 'Exports To', key: 'exportAmt', sortable: true, align: 'end' as const },
]

interface ConnectionMaterialRow {
  ticker: string
  categories: string[]
  production: string
  demand: string
  net: string
  netValue: number
  rawImportAmt: number
  rawExportAmt: number
  importAmt: number
  exportAmt: number
  connStock: number
  parentStock: number
}

// Per-destination category filter state
// Track expanded source panels — initialized from pageState, synced back on change
const expandedSourcePanels = reactive<Record<string, number[]>>({})
const expandedConnections = reactive<Record<string, number[]>>({})
const connectionSort = ref<'name' | 'system' | 'gaps'>('name')
let expandedRestored = false

function sortedConnections(location: LocationDashboard): ConnectionDashboard[] {
  const conns = [...location.connections]
  switch (connectionSort.value) {
    case 'name':
      return conns.sort((a, b) =>
        getLocationDisplay(a.locationId).localeCompare(getLocationDisplay(b.locationId))
      )
    case 'system':
      return conns.sort((a, b) => a.locationId.localeCompare(b.locationId))
    case 'gaps':
      return conns.sort(
        (a, b) => connectionGapCount(location, b) - connectionGapCount(location, a)
      )
    default:
      return conns
  }
}

function expandAllConnections(location: LocationDashboard) {
  expandedConnections[location.locationId] = sortedConnections(location).map((_, i) => i)
}

function collapseAllConnections(location: LocationDashboard) {
  expandedConnections[location.locationId] = []
}

// Restore expanded state from pageState after dashboard loads
function restoreExpandedSources() {
  for (const sourceId of pageState.expandedSources) {
    expandedSourcePanels[sourceId] = [0]
  }
  expandedRestored = true
}

// Sync panel state back to pageState (only after restore completes)
watch(
  expandedSourcePanels,
  panels => {
    if (!expandedRestored) return
    const expanded: string[] = []
    for (const [sourceId, value] of Object.entries(panels)) {
      if (value && value.length > 0) expanded.push(sourceId)
    }
    pageState.expandedSources.splice(0, pageState.expandedSources.length, ...expanded)
  },
  { deep: true }
)

const sourceStockSort = pageState.sourceStockSort
const sourceCardHeight = pageState.sourceCardHeight
const sourceOrderPriceList = pageState.sourceOrderPriceList

// Source-level category/storage filters — independent per card side
type FilterSide = 'stock' | 'order'
const stockFilters = reactive<Record<string, { cats: Set<string>; storages: Set<string> }>>({})
const orderFilters = reactive<Record<string, { cats: Set<string>; storages: Set<string> }>>({})

function getFilterStore(side: FilterSide) {
  return side === 'stock' ? stockFilters : orderFilters
}

function getLocationCategories(location: LocationDashboard): string[] {
  const cats = new Set<string>()
  for (const conn of location.connections) {
    for (const exp of conn.exports) cats.add(exp.lineSource)
    for (const imp of conn.imports) cats.add(imp.lineSource)
  }
  return [...cats]
}

function getLocationStorageTypes(location: LocationDashboard): string[] {
  const types = new Set<string>()
  for (const conn of location.connections) {
    for (const st of conn.storageTypes) types.add(st)
  }
  return [...types].sort()
}

function ensureSourceFilters(locationId: string, location: LocationDashboard, side: FilterSide) {
  const store = getFilterStore(side)
  if (!store[locationId]) {
    store[locationId] = {
      cats: new Set(getLocationCategories(location)),
      storages: new Set(getLocationStorageTypes(location)),
    }
  }
  return store[locationId]
}

function isSourceFilterActive(
  sourceId: string,
  type: 'cat' | 'storage',
  value: string,
  side: FilterSide
): boolean {
  const f = getFilterStore(side)[sourceId]
  if (!f) return true
  return type === 'cat' ? f.cats.has(value) : f.storages.has(value)
}

function toggleSourceFilter(
  sourceId: string,
  type: 'cat' | 'storage',
  value: string,
  side: FilterSide
) {
  const store = getFilterStore(side)
  if (!store[sourceId]) return
  const set = type === 'cat' ? store[sourceId].cats : store[sourceId].storages
  if (set.has(value)) {
    if (set.size > 1) set.delete(value)
  } else {
    set.add(value)
  }
}

/** Get tickers that pass the location-level category + storage filters */
function getSourceFilteredTickers(location: LocationDashboard, side: FilterSide): Set<string> {
  const f = ensureSourceFilters(location.locationId, location, side)
  const tickers = new Set<string>()
  for (const conn of location.connections) {
    if (!conn.storageTypes.some(st => f.storages.has(st))) continue
    for (const exp of conn.exports) {
      if (f.cats.has(exp.lineSource)) tickers.add(exp.ticker)
    }
    for (const imp of conn.imports) {
      if (f.cats.has(imp.lineSource)) tickers.add(imp.ticker)
    }
  }
  return tickers
}

function startResize(event: MouseEvent, sourceId: string) {
  event.preventDefault()
  const startY = event.clientY
  const startHeight = sourceCardHeight[sourceId] ?? 250

  const onMove = (e: MouseEvent) => {
    const delta = e.clientY - startY
    sourceCardHeight[sourceId] = Math.max(150, startHeight + delta)
  }

  const onUp = () => {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}
const priceLists = ref<{ code: string; name: string; currency: string }[]>([])
const sourcePrices = reactive<Record<string, Map<string, number>>>({})

interface SourceStockItem {
  ticker: string
  quantity: number
  commodity: Commodity | null
}

/**
 * Get the effective import and gap for a ticker at a location, respecting the output filter.
 * When the production_output filter is off, import is zeroed and gap recalculated without it.
 */
function effectiveSupplyAndGap(
  location: LocationDashboard,
  ticker: string,
  side: FilterSide
): { supply: number; gap: number } {
  const f = getFilterStore(side)[location.locationId]
  const outputActive = f ? f.cats.has('production_output') : true
  const supply = outputActive ? (location.aggregatedImport[ticker] ?? 0) : 0
  const need = location.aggregatedExport[ticker] ?? 0
  const stock = stockMode.value === 'included' ? (location.stock[ticker] ?? 0) : 0
  const gap = Math.max(0, need - stock - supply)
  return { supply, gap }
}

function stockQtyClass(
  item: SourceStockItem,
  location: LocationDashboard
): Record<string, boolean> {
  if (item.quantity <= 0) return { 'stock-qty-zero': true }
  const { supply, gap } = effectiveSupplyAndGap(location, item.ticker, 'stock')
  const need = location.aggregatedExport[item.ticker] ?? 0
  if (supply > 0 && supply >= need) return { 'stock-qty-surplus': true }
  if (gap > 0) return { 'stock-qty-gap': true }
  return {}
}

function getSortedSourceStock(location: LocationDashboard): SourceStockItem[] {
  const filteredTickers = getSourceFilteredTickers(location, 'stock')
  const items: SourceStockItem[] = Object.entries(location.stock)
    .filter(
      ([ticker]) =>
        ((location.aggregatedExport[ticker] ?? 0) > 0 ||
          (location.aggregatedImport[ticker] ?? 0) > 0) &&
        filteredTickers.has(ticker)
    )
    .map(([ticker, quantity]) => {
      const cat = commodityService.getCommodityCategory(ticker)
      return {
        ticker,
        quantity,
        commodity:
          cat !== null
            ? {
                ticker,
                name: commodityService.getCommodityDisplay(ticker, 'name-only'),
                category: cat,
              }
            : null,
      }
    })

  // Initialize sort default
  if (!sourceStockSort[location.locationId]) {
    sourceStockSort[location.locationId] = 'name'
  }

  const sortMode = sourceStockSort[location.locationId]
  if (sortMode === 'amount') {
    items.sort((a, b) => b.quantity - a.quantity)
  } else if (sortMode === 'category') {
    items.sort((a, b) => {
      const catA = a.commodity?.category ?? ''
      const catB = b.commodity?.category ?? ''
      return catA.localeCompare(catB) || a.ticker.localeCompare(b.ticker)
    })
  } else {
    items.sort((a, b) => a.ticker.localeCompare(b.ticker))
  }
  return items
}

function getSourceGaps(location: LocationDashboard): { ticker: string; gap: number }[] {
  const allTickers = new Set([
    ...Object.keys(location.aggregatedExport),
    ...Object.keys(location.aggregatedImport),
  ])
  return [...allTickers]
    .map(ticker => ({ ticker, gap: effectiveSupplyAndGap(location, ticker, 'order').gap }))
    .filter(item => item.gap > 0)
    .sort((a, b) => a.ticker.localeCompare(b.ticker))
}

function getFilteredSourceGaps(location: LocationDashboard): { ticker: string; gap: number }[] {
  const filteredTickers = getSourceFilteredTickers(location, 'order')
  return getSourceGaps(location).filter(item => filteredTickers.has(item.ticker))
}

function getGapPrice(location: LocationDashboard, ticker: string): number | null {
  const prices = sourcePrices[location.locationId]
  return prices?.get(ticker) ?? null
}

function getSourceOrderTotal(location: LocationDashboard): number | null {
  const prices = sourcePrices[location.locationId]
  if (!prices || prices.size === 0) return null
  const gaps = getFilteredSourceGaps(location)
  let total = 0
  let hasAny = false
  for (const { ticker, gap } of gaps) {
    const price = prices.get(ticker)
    if (price !== undefined) {
      total += price * gap
      hasAny = true
    }
  }
  return hasAny ? total : null
}

function getSourceOrderWeight(location: LocationDashboard): number {
  let total = 0
  for (const { ticker, gap } of getFilteredSourceGaps(location)) {
    const w = commodityService.getCommodityWeight(ticker)
    if (w) total += w * gap
  }
  return total
}

function getSourceOrderVolume(location: LocationDashboard): number {
  let total = 0
  for (const { ticker, gap } of getFilteredSourceGaps(location)) {
    const v = commodityService.getCommodityVolume(ticker)
    if (v) total += v * gap
  }
  return total
}

async function copySourceGapsCsv(location: LocationDashboard) {
  const gaps = getFilteredSourceGaps(location)
  if (gaps.length === 0) return
  const currency = settingsStore.preferredCurrency.value
  const lines = gaps.map(item => {
    const price = getGapPrice(location, item.ticker)
    const total = price !== null ? (price * item.gap).toFixed(2) : ''
    const wt = commodityService.getCommodityWeight(item.ticker)
    const vol = commodityService.getCommodityVolume(item.ticker)
    return `${item.ticker},${item.gap},${price?.toFixed(2) ?? ''},${total},${wt ? (wt * item.gap).toFixed(2) : ''},${vol ? (vol * item.gap).toFixed(2) : ''}`
  })
  const csv = `Material,Qty,Price (${currency}),Total (${currency}),Weight (t),Volume (m³)\n${lines.join('\n')}`
  try {
    await navigator.clipboard.writeText(csv)
    showSnackbar('Copied to clipboard')
  } catch {
    showSnackbar('Failed to copy to clipboard', 'error')
  }
}

function createShoppingListFromGaps(location: LocationDashboard) {
  const gaps = getFilteredSourceGaps(location)
  if (gaps.length === 0) return
  const materials: Record<string, number> = {}
  for (const item of gaps) {
    materials[item.ticker] = item.gap
  }
  const locationName = getLocationDisplay(location.locationId)
  shoppingListStore.setMaterials(materials, `Supply Order – ${locationName}`)
  router.push('/market')
}

function formatPrice(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatWeight(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function formatVolume(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 })
}

function getItemWeight(ticker: string, qty: number): string {
  const w = commodityService.getCommodityWeight(ticker)
  return w ? formatWeight(w * qty) : '–'
}

function getItemVolume(ticker: string, qty: number): string {
  const v = commodityService.getCommodityVolume(ticker)
  return v ? formatVolume(v * qty) : '–'
}

async function loadPriceLists() {
  try {
    const lists = await api.priceLists.list()
    priceLists.value = lists.map(l => ({ code: l.code, name: l.name, currency: l.currency }))
  } catch {
    // Silently fail - pricing is optional
  }
}

async function loadSourcePrices(location: LocationDashboard) {
  const priceListCode = sourceOrderPriceList[location.locationId]
  if (!priceListCode) {
    delete sourcePrices[location.locationId]
    return
  }
  try {
    const currency = settingsStore.preferredCurrency.value
    const prices = await api.prices.getEffective(priceListCode, location.locationId, currency)
    const priceMap = new Map<string, number>()
    for (const p of prices) {
      priceMap.set(p.commodityTicker, p.finalPrice)
    }
    sourcePrices[location.locationId] = priceMap
  } catch {
    delete sourcePrices[location.locationId]
  }
}

// Watch price list changes to reload prices
watch(sourceOrderPriceList, () => {
  for (const loc of dashboard.value?.locations ?? []) {
    loadSourcePrices(loc)
  }
})

// Per-planet filters: enabled categories and storage types (all enabled by default)
const planetFilters = reactive<Record<string, { cats: Set<string>; storages: Set<string> }>>({})

function getPlanetFilters(connectionId: string, conn: ConnectionDashboard) {
  if (!planetFilters[connectionId]) {
    planetFilters[connectionId] = {
      cats: new Set(connectionCategories(conn)),
      storages: new Set(conn.storageTypes),
    }
  }
  return planetFilters[connectionId]
}

function isPlanetFilterActive(planetId: string, type: 'cat' | 'storage', value: string): boolean {
  const f = planetFilters[planetId]
  if (!f) return true
  return type === 'cat' ? f.cats.has(value) : f.storages.has(value)
}

function togglePlanetFilter(planetId: string, type: 'cat' | 'storage', value: string) {
  // Ensure filters exist
  if (!planetFilters[planetId]) return
  const set = type === 'cat' ? planetFilters[planetId].cats : planetFilters[planetId].storages
  if (set.has(value)) {
    set.delete(value)
  } else {
    set.add(value)
  }
}

function importColor(item: ConnectionMaterialRow): string {
  if (item.importAmt <= 0) return 'text-success' // fully covered by destination stock
  // Does the source (parent) have enough to ship the remaining need?
  if (item.parentStock >= item.importAmt) return 'text-success'
  if (item.parentStock > 0) return 'text-warning'
  return 'text-error'
}

function exportColor(item: ConnectionMaterialRow): string {
  if (item.exportAmt <= 0) return 'text-success' // nothing to export
  // Does this connection have enough stock to cover the export?
  if (item.connStock >= item.exportAmt) return 'text-success'
  if (item.connStock > 0) return 'text-warning'
  return 'text-error'
}

function formatRate(total: number, daily: number): string {
  if (total <= 0) return '–'
  const d = daily % 1 === 0 ? daily.toFixed(0) : daily.toFixed(1)
  return `${Math.ceil(total)} (${d}/d)`
}

function getConnectionMaterials(
  location: LocationDashboard,
  conn: ConnectionDashboard
): ConnectionMaterialRow[] {
  const filters = getPlanetFilters(conn.locationId, conn)
  const burnDays = dashboard.value?.settings.burnDays ?? 7
  const agg = new Map<string, { categories: string[]; exportAmt: number; importAmt: number }>()

  // Flip perspective: parent's exports = connection's imports, parent's imports = connection's exports
  for (const exp of conn.exports) {
    if (!filters.cats.has(exp.lineSource)) continue
    const existing = agg.get(exp.ticker)
    if (existing) {
      existing.importAmt += exp.amount
      if (!existing.categories.includes(exp.lineSource)) existing.categories.push(exp.lineSource)
    } else {
      agg.set(exp.ticker, { categories: [exp.lineSource], exportAmt: 0, importAmt: exp.amount })
    }
  }

  for (const imp of conn.imports) {
    if (!filters.cats.has(imp.lineSource)) continue
    const existing = agg.get(imp.ticker)
    if (existing) {
      existing.exportAmt += imp.amount
      if (!existing.categories.includes(imp.lineSource)) existing.categories.push(imp.lineSource)
    } else {
      agg.set(imp.ticker, { categories: [imp.lineSource], exportAmt: imp.amount, importAmt: 0 })
    }
  }

  return [...agg.entries()].map(([ticker, row]) => {
    const rates = conn.rates?.[ticker]
    const dailyProd = rates?.dailyProduction ?? 0
    const dailyDem = rates?.dailyDemand ?? 0
    const dailyNet = dailyProd - dailyDem
    const totalNet = dailyNet * burnDays

    const connStock = conn.connectionStock[ticker] ?? 0
    const parentStock = location.stock[ticker] ?? 0
    const includeStock = stockMode.value === 'included'

    // When stock included: imports reduced by destination stock, exports reduced by source stock
    const adjustedImport = includeStock ? Math.max(0, row.importAmt - connStock) : row.importAmt
    const adjustedExport = includeStock ? Math.max(0, row.exportAmt - parentStock) : row.exportAmt

    return {
      ticker,
      categories: row.categories,
      production: formatRate(dailyProd * burnDays, dailyProd),
      demand: formatRate(dailyDem * burnDays, dailyDem),
      net: totalNet === 0 ? '–' : formatRate(Math.abs(totalNet), Math.abs(dailyNet)),
      netValue: totalNet,
      rawImportAmt: row.importAmt,
      rawExportAmt: row.exportAmt,
      importAmt: adjustedImport,
      exportAmt: adjustedExport,
      connStock,
      parentStock,
    }
  })
}
const expandedCats = reactive<Record<string, boolean>>({})

function toggleExpandedCat(planetId: string, cat: string) {
  const key = `${planetId}:${cat}`
  expandedCats[key] = !expandedCats[key]
}

function isCatExpanded(planetId: string, cat: string): boolean {
  return !!expandedCats[`${planetId}:${cat}`]
}

function maxConnectionNameWidth(location: LocationDashboard): number {
  let max = 0
  for (const conn of location.connections) {
    const name = getLocationDisplay(conn.locationId)
    if (name.length > max) max = name.length
  }
  return max
}

function connectionCategories(conn: ConnectionDashboard): string[] {
  const cats = new Set<string>()
  for (const exp of conn.exports) cats.add(exp.lineSource)
  for (const imp of conn.imports) cats.add(imp.lineSource)
  return [...cats]
}

function connectionCategoryTickers(conn: ConnectionDashboard, cat: string): Commodity[] {
  const seen = new Set<string>()
  const result: Commodity[] = []
  const items = [
    ...conn.exports.filter(e => e.lineSource === cat),
    ...conn.imports.filter(i => i.lineSource === cat),
  ]
  for (const item of items) {
    if (!seen.has(item.ticker)) {
      seen.add(item.ticker)
      result.push({
        ticker: item.ticker,
        name: commodityService.getCommodityDisplay(item.ticker, 'name-only'),
        category: commodityService.getCommodityCategory(item.ticker) ?? undefined,
      })
    }
  }
  return result
}

function connectionGapCount(location: LocationDashboard, conn: ConnectionDashboard): number {
  const tickers = new Set<string>()
  for (const exp of conn.exports) tickers.add(exp.ticker)
  for (const imp of conn.imports) tickers.add(imp.ticker)
  return [...tickers].filter(t => effectiveSupplyAndGap(location, t, 'order').gap > 0).length
}

const configHeaders = [
  { title: 'Material', key: 'commodityTicker', sortable: true },
  { title: 'Source', key: 'sourceLocationId', sortable: true },
  { title: 'Source Storage', key: 'srcStorage', sortable: false, width: 70 },
  { title: 'Destination', key: 'destinationPlanetId', sortable: true },
  { title: 'Dest Storage', key: 'destStorage', sortable: false, width: 70 },
  { title: 'Category', key: 'demandInfo', sortable: true, value: 'lineSource' },
  { title: 'Mode', key: 'demandMode', sortable: true, value: 'isAuto', width: 70 },
  { title: 'Amount', key: 'demandAmount', sortable: true, value: 'effectiveAmount' },
]

// Helpers

// Data loading
async function loadCommodityItems() {
  let data: Commodity[] = commodityService.getAllCommoditiesSync()
  if (data.length === 0) {
    loadingCommodities.value = true
    data = await commodityService.getAllCommodities()
    loadingCommodities.value = false
  }
  commodityItems.value = data.map(c => ({
    key: c.ticker,
    display: `${c.ticker} - ${localizeMaterial(c.name)}`,
    name: localizeMaterial(c.name),
    category: c.category,
  }))
}

async function loadLocationItems() {
  try {
    loadingLocations.value = true
    const displayMode = userStore.getLocationDisplayMode()
    const [allLocs] = await Promise.all([
      locationService.getAllLocations(),
      locationService.loadUserLocations(),
    ])
    const allItems = allLocs.map(l => ({
      key: l.id,
      display: locationService.getLocationDisplay(l.id, displayMode),
      locationType: l.type,
      isUserLocation: locationService.isUserLocation(l.id),
      storageTypes: locationService.getStorageTypes(l.id),
    }))
    locationItems.value = allItems
    // Planets only for destination (user's synced planets)
    const planetIds = new Set(planets.value.map(p => p.planetNaturalId))
    planetItems.value = allItems.filter(l => planetIds.has(l.key))
  } catch (error) {
    console.error('Failed to load locations', error)
  } finally {
    loadingLocations.value = false
  }
}

async function loadDashboard() {
  try {
    loading.value = true
    // First load lines and metadata (needed for auto-selection)
    const [planetData, lineData, locData] = await Promise.all([
      api.supplyDashboard.getPlanets(),
      api.supplyChain.list(),
      api.supplyChain.getLocations(),
    ])
    planets.value = planetData
    allLines.value = lineData
    storageLocations.value = locData
    await Promise.all([loadLocationItems(), loadCommodityItems(), loadPriceLists()])

    // Auto-select location if none persisted
    autoSelectLocation()

    // Now load dashboard for the selected location
    const dashData = await api.supplyDashboard.get(pageState.selectedLocation || undefined)
    dashboard.value = dashData

    // Initialize price list defaults for each location
    const defaultPL = settingsStore.defaultPriceList.value
    for (const loc of dashData.locations) {
      if (!(loc.locationId in sourceOrderPriceList)) {
        sourceOrderPriceList[loc.locationId] = defaultPL
      }
    }
    // Load prices for locations with a selected price list
    for (const loc of dashData.locations) {
      if (sourceOrderPriceList[loc.locationId]) {
        loadSourcePrices(loc)
      }
    }
    burnDays.value = dashData.settings.burnDays
    repairDays.value = dashData.settings.repairDays
    conditionMode.value = dashData.settings.conditionMode ?? 'max'
  } catch (error) {
    showSnackbar(error instanceof Error ? error.message : 'Failed to load dashboard', 'error')
  } finally {
    loading.value = false
  }
}

async function syncInventoryAndReload() {
  try {
    syncingInventory.value = true
    await api.supplyDashboard.syncInventory()
    showSnackbar('Inventory synced')
    await loadDashboard()
  } catch (error) {
    showSnackbar(error instanceof Error ? error.message : 'Inventory sync failed', 'error')
  } finally {
    syncingInventory.value = false
  }
}

async function syncPlanetsAndReload() {
  try {
    syncingPlanets.value = true
    await api.supplyDashboard.sync()
    showSnackbar('Planet data synced')
    await loadDashboard()
  } catch (error) {
    showSnackbar(error instanceof Error ? error.message : 'Planet sync failed', 'error')
  } finally {
    syncingPlanets.value = false
  }
}

let saveTimer: ReturnType<typeof setTimeout> | null = null
function saveSettingDebounced(key: string, value: unknown) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    try {
      await api.updateUserSettings({ [key]: value })
      await loadDashboard()
    } catch {
      showSnackbar('Failed to save setting', 'error')
    }
  }, 600)
}

// Config dialog actions
async function bulkAdd(type: 'consumables' | 'repair' | 'inputs' | 'production_output') {
  try {
    bulkAdding.value = true
    const request = {
      sourceLocationId: addForm.value.sourceLocationId,
      destinationPlanetId: addForm.value.destinationPlanetId,
      sourceStorageTypes:
        addForm.value.sourceStorageTypes.length > 0 ? addForm.value.sourceStorageTypes : undefined,
      destinationStorageTypes:
        addForm.value.addStorageTypes.length > 0 ? addForm.value.addStorageTypes : undefined,
    }
    let result
    if (type === 'consumables') result = await api.supplyChain.addConsumables(request)
    else if (type === 'repair') result = await api.supplyChain.addRepair(request)
    else if (type === 'production_output') result = await api.supplyChain.addOutputs(request)
    else result = await api.supplyChain.addInputs(request)

    showSnackbar(`Added ${result.created} lines, skipped ${result.skipped}`)
    allLines.value = await api.supplyChain.list()
    // Reload dashboard to reflect changes
    dashboard.value = await api.supplyDashboard.get(pageState.selectedLocation || undefined)
  } catch (error) {
    showSnackbar(error instanceof Error ? error.message : `Failed to add ${type} lines`, 'error')
  } finally {
    bulkAdding.value = false
  }
}

function enterEditMode() {
  editMode.value = true
  selectedLineIds.value = []
  // Clear any stale edits
  for (const key of Object.keys(pendingEdits)) delete pendingEdits[Number(key)]
}

function exitEditMode() {
  editMode.value = false
  selectedLineIds.value = []
  for (const key of Object.keys(pendingEdits)) delete pendingEdits[Number(key)]
}

async function saveEdits() {
  const entries = Object.entries(pendingEdits).filter(([, v]) => Object.keys(v).length > 0)
  if (entries.length === 0) {
    exitEditMode()
    return
  }
  try {
    savingEdits.value = true
    await Promise.all(entries.map(([id, updates]) => api.supplyChain.update(Number(id), updates)))
    showSnackbar(`Updated ${entries.length} ${entries.length === 1 ? 'line' : 'lines'}`)
    allLines.value = await api.supplyChain.list()
    dashboard.value = await api.supplyDashboard.get(pageState.selectedLocation || undefined)
    exitEditMode()
  } catch {
    showSnackbar('Failed to save changes', 'error')
  } finally {
    savingEdits.value = false
  }
}

function selectAllLines() {
  selectedLineIds.value = filteredLines.value.map(l => l.id)
}

/** Get the IDs to apply an edit to: the edited item + all selected lines */
function editTargetIds(item: SupplyChainLineResponse): number[] {
  if (selectedLineIds.value.includes(item.id)) return [...selectedLineIds.value]
  return [item.id]
}

function toggleLineStorage(
  item: SupplyChainLineResponse,
  side: 'source' | 'destination',
  storageType: string
) {
  const effective = editedLine(item)
  const field = side === 'source' ? 'sourceStorageTypes' : 'destinationStorageTypes'
  const current = [...(effective[field] as string[])]
  const idx = current.indexOf(storageType)
  if (idx >= 0) {
    if (current.length <= 1) return // Must keep at least one
    current.splice(idx, 1)
  } else {
    current.push(storageType)
  }
  // Apply the resulting storage array to all target lines (overwrite)
  for (const id of editTargetIds(item)) {
    if (!pendingEdits[id]) pendingEdits[id] = {}
    pendingEdits[id][field] = [...current]
  }
}

function updateLineField(
  item: SupplyChainLineResponse,
  field: 'lineSource' | 'demand' | 'demandRate',
  value: unknown
) {
  for (const id of editTargetIds(item)) {
    if (!pendingEdits[id]) pendingEdits[id] = {}
    ;(pendingEdits[id] as Record<string, unknown>)[field] = value
  }
}

async function handleAdd() {
  const cat = addForm.value.category as
    | 'consumables'
    | 'inputs'
    | 'repair'
    | 'production_output'
    | 'government'
    | 'other'

  // Bulk add (All materials, auto amount)
  if (addForm.value.materialAll && AUTO_CATEGORIES.has(cat)) {
    await bulkAdd(cat as 'consumables' | 'repair' | 'inputs' | 'production_output')
    return
  }

  // Single line add
  try {
    addingManualLine.value = true
    await api.supplyChain.create({
      commodityTicker: addForm.value.addTicker,
      sourceLocationId: addForm.value.sourceLocationId,
      destinationPlanetId: addForm.value.destinationPlanetId,
      sourceStorageTypes: addForm.value.sourceStorageTypes,
      destinationStorageTypes: addForm.value.addStorageTypes,
      mode: 'demand',
      lineSource: cat,
      demand: addForm.value.amountAuto ? undefined : (addForm.value.addAmount ?? undefined),
    })
    showSnackbar('Line added')
    addForm.value.addTicker = ''
    addForm.value.addAmount = null
    allLines.value = await api.supplyChain.list()
    dashboard.value = await api.supplyDashboard.get(pageState.selectedLocation || undefined)
  } catch (error) {
    showSnackbar(error instanceof Error ? error.message : 'Failed to add line', 'error')
  } finally {
    addingManualLine.value = false
  }
}

async function deleteSelectedLines() {
  try {
    clearing.value = true
    await Promise.all(selectedLineIds.value.map(id => api.supplyChain.delete(id)))
    showSnackbar(`Deleted ${selectedLineIds.value.length} lines`)
    confirmClearAll.value = false
    selectedLineIds.value = []
    editMode.value = false
    allLines.value = await api.supplyChain.list()
    dashboard.value = await api.supplyDashboard.get(pageState.selectedLocation || undefined)
  } catch (error) {
    showSnackbar(error instanceof Error ? error.message : 'Failed to delete lines', 'error')
  } finally {
    clearing.value = false
  }
}

onMounted(async () => {
  await loadDashboard()
  restoreExpandedSources()

  // Restore persisted search chips
  if (pageState.linesSearchChips.length > 0 && linesSearchRef.value) {
    const chips: SearchChip[] = pageState.linesSearchChips.map(c => ({
      type: c.type as SearchChip['type'],
      value: c.value,
      display: c.display,
    }))
    await nextTick()
    linesSearchRef.value.setChips(chips)
  }
})
</script>

<style scoped>
.settings-label-btn {
  cursor: default !important;
  pointer-events: none;
  opacity: 0.6 !important;
}

:deep(.v-data-table) tbody tr td {
  padding-top: 4px !important;
  padding-bottom: 4px !important;
}

/* Hide number input spinners */
:deep(input[type='number']::-webkit-outer-spin-button),
:deep(input[type='number']::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}

:deep(input[type='number']) {
  -moz-appearance: textfield;
}

.cell-link {
  color: inherit;
  cursor: pointer;
  opacity: 0.85;
}

.cell-link:hover {
  opacity: 1;
  text-decoration: underline !important;
}

.source-panel :deep(.v-expansion-panel-text__wrapper) {
  background: rgba(0, 0, 0, 0.15);
}

.source-stock-card {
  background: rgb(var(--v-theme-surface)) !important;
}

.stock-cards-container {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.stock-cards-container :deep(.v-row) {
  flex: 1 1 0;
  min-height: 0;
  margin: 0;
}

.stock-cards-container :deep(.v-col) {
  height: 100%;
}

.stock-cards-container :deep(.v-card) {
  height: 100% !important;
  display: flex !important;
  flex-direction: column !important;
  overflow: hidden !important;
}

.stock-cards-container :deep(.v-card > .v-card-text) {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

.resize-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 20px;
  margin: 0 0 12px 0;
  cursor: ns-resize;
  user-select: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.05);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  transition: background 0.15s;
}

.resize-handle:hover {
  background: rgba(255, 255, 255, 0.1);
}

.stock-icon-wrapper {
  position: relative;
  display: inline-block;
}

.stock-icon {
  width: 48px !important;
  height: 48px !important;
  border-radius: 4px;
}

.stock-icon-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  background: #333;
  color: #aaa;
  font-size: 10px;
  font-weight: bold;
}

.stock-qty {
  position: absolute;
  bottom: 1px;
  right: 2px;
  background: rgba(0, 0, 0, 0.8);
  color: #fff;
  font-size: 10px;
  font-weight: 400;
  line-height: 1;
  padding: 1px 3px;
  border-radius: 2px;
  pointer-events: none;
}

.stock-qty-zero {
  color: #ef5350 !important;
}

.stock-qty-surplus {
  color: #4caf50 !important;
}

.stock-qty-gap {
  color: #ffc107 !important;
}

.source-order-table {
  flex: 1 1 0;
  min-height: 0;
  overflow-y: auto;
}

.source-order-table :deep(td),
.source-order-table :deep(th) {
  padding-top: 6px !important;
  padding-bottom: 6px !important;
}

.panel-commodity-icon {
  width: 22px !important;
  height: 22px !important;
  font-size: 7px !important;
  border-radius: 3px;
}

.mat-icons {
  display: inline-flex;
  align-items: center;
}

/* On narrow screens, collapse material icons behind category icon */
@media (max-width: 960px) {
  .mat-icons {
    display: none;
  }

  .mat-icons-expanded {
    display: inline-flex !important;
    align-items: center;
  }

  .cat-icon {
    cursor: pointer;
  }
}

.planet-panel-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  width: 100%;
  gap: 12px;
}

.planet-name {
  white-space: nowrap;
}
</style>
