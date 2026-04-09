<template>
  <v-container fluid>
    <v-snackbar v-model="snackbar.show" :color="snackbar.color" :timeout="3000">
      {{ snackbar.message }}
    </v-snackbar>

    <!-- Settings & Sync Card -->
    <v-card class="mb-4">
      <v-card-text>
        <v-row align="center">
          <v-col cols="12" sm="4" md="3">
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
          <v-col cols="12" sm="4" md="3">
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
            <span class="text-body-2 mr-2">Condition:</span>
            <v-btn-toggle
              v-model="conditionMode"
              density="compact"
              variant="outlined"
              color="primary"
              mandatory
              @update:model-value="saveSettingDebounced('supply.conditionMode', $event)"
            >
              <v-btn value="actual" size="small">Actual</v-btn>
              <v-btn value="max" size="small">Max</v-btn>
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
          Sources
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
        <!-- Sources Tab -->
        <v-tabs-window-item value="planet">
          <v-card v-if="!dashboard || dashboard.sources.length === 0" class="mb-4">
            <v-card-text class="text-center py-8">
              <v-icon size="64" color="grey-lighten-1">mdi-link-variant-off</v-icon>
              <p class="text-h6 mt-4">No supply chain configured</p>
              <p class="text-body-2 text-medium-emphasis">
                Use the Supply Lines tab to set up material flows.
              </p>
            </v-card-text>
          </v-card>
          <v-expansion-panels
            v-for="source in dashboard?.sources ?? []"
            :key="source.sourceLocationId"
            v-model="expandedSourcePanels[source.sourceLocationId]"
            class="mb-4"
          >
            <v-expansion-panel class="source-panel">
              <v-expansion-panel-title>
                <div class="d-flex align-center">
                  <v-icon start>mdi-warehouse</v-icon>
                  <span class="text-h6">{{ getLocationDisplay(source.sourceLocationId) }}</span>
                </div>
              </v-expansion-panel-title>
              <v-expansion-panel-text>
                <!-- Stock + Order cards -->
                <div
                  class="stock-cards-container"
                  :style="{ height: (sourceCardHeight[source.sourceLocationId] ?? 250) + 'px' }"
                >
                  <v-row>
                    <!-- Left: Stock -->
                    <v-col cols="12" md="6">
                      <v-card class="source-stock-card">
                        <v-card-text>
                          <div class="d-flex align-center mb-1">
                            <v-icon start size="small">mdi-package-variant</v-icon>
                            <span class="text-subtitle-2">Stock</span>
                            <v-spacer />
                            <v-icon size="small" class="mr-1 text-medium-emphasis">mdi-sort</v-icon>
                            <v-btn-toggle
                              v-model="sourceStockSort[source.sourceLocationId]"
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
                              v-for="cat in getSourceCategories(source)"
                              :key="cat"
                              size="x-small"
                              :variant="
                                isSourceFilterActive(source.sourceLocationId, 'cat', cat, 'stock')
                                  ? 'flat'
                                  : 'outlined'
                              "
                              :color="
                                isSourceFilterActive(source.sourceLocationId, 'cat', cat, 'stock')
                                  ? 'primary'
                                  : undefined
                              "
                              @click="
                                toggleSourceFilter(source.sourceLocationId, 'cat', cat, 'stock')
                              "
                            >
                              <v-icon start size="small">{{ getCategoryIcon(cat) }}</v-icon>
                              {{ categoryLabel(cat) }}
                            </v-btn>
                            <v-divider vertical class="mx-1" />
                            <v-btn
                              v-for="st in getSourceStorageTypes(source)"
                              :key="st"
                              size="x-small"
                              :variant="
                                isSourceFilterActive(
                                  source.sourceLocationId,
                                  'storage',
                                  st,
                                  'stock'
                                )
                                  ? 'flat'
                                  : 'outlined'
                              "
                              :color="
                                isSourceFilterActive(
                                  source.sourceLocationId,
                                  'storage',
                                  st,
                                  'stock'
                                )
                                  ? 'primary'
                                  : undefined
                              "
                              @click="
                                toggleSourceFilter(source.sourceLocationId, 'storage', st, 'stock')
                              "
                            >
                              <v-icon start size="small">{{
                                st === 'STORE' ? 'mdi-earth' : 'mdi-warehouse'
                              }}</v-icon>
                              {{ st === 'STORE' ? 'Base' : 'WAR' }}
                            </v-btn>
                          </div>
                          <div class="d-flex flex-wrap ga-1">
                            <div
                              v-for="item in getSortedSourceStock(source)"
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
                              <span
                                class="stock-qty"
                                :class="{
                                  'stock-qty-zero': item.quantity <= 0,
                                  'stock-qty-gap':
                                    item.quantity > 0 && (source.gap[item.ticker] ?? 0) > 0,
                                }"
                              >
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
                              v-model="sourceOrderPriceList[source.sourceLocationId]"
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
                              v-for="cat in getSourceCategories(source)"
                              :key="cat"
                              size="x-small"
                              :variant="
                                isSourceFilterActive(source.sourceLocationId, 'cat', cat, 'order')
                                  ? 'flat'
                                  : 'outlined'
                              "
                              :color="
                                isSourceFilterActive(source.sourceLocationId, 'cat', cat, 'order')
                                  ? 'primary'
                                  : undefined
                              "
                              @click="
                                toggleSourceFilter(source.sourceLocationId, 'cat', cat, 'order')
                              "
                            >
                              <v-icon start size="small">{{ getCategoryIcon(cat) }}</v-icon>
                              {{ categoryLabel(cat) }}
                            </v-btn>
                            <v-divider vertical class="mx-1" />
                            <v-btn
                              v-for="st in getSourceStorageTypes(source)"
                              :key="st"
                              size="x-small"
                              :variant="
                                isSourceFilterActive(
                                  source.sourceLocationId,
                                  'storage',
                                  st,
                                  'order'
                                )
                                  ? 'flat'
                                  : 'outlined'
                              "
                              :color="
                                isSourceFilterActive(
                                  source.sourceLocationId,
                                  'storage',
                                  st,
                                  'order'
                                )
                                  ? 'primary'
                                  : undefined
                              "
                              @click="
                                toggleSourceFilter(source.sourceLocationId, 'storage', st, 'order')
                              "
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
                              :disabled="getFilteredSourceGaps(source).length === 0"
                              @click="copySourceGapsCsv(source)"
                            >
                              CSV
                            </v-btn>
                            <v-btn
                              size="x-small"
                              variant="outlined"
                              prepend-icon="mdi-cart-plus"
                              :disabled="getFilteredSourceGaps(source).length === 0"
                              @click="createShoppingListFromGaps(source)"
                            >
                              Shopping List
                            </v-btn>
                          </div>
                          <div class="source-order-table flex-grow-1">
                            <v-table
                              v-if="getFilteredSourceGaps(source).length > 0"
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
                                  v-for="item in getFilteredSourceGaps(source)"
                                  :key="item.ticker"
                                >
                                  <td>
                                    <CommodityDisplay :ticker="item.ticker" />
                                  </td>
                                  <td class="text-right text-medium-emphasis">
                                    <template v-if="getGapPrice(source, item.ticker) !== null">
                                      {{ formatPrice(getGapPrice(source, item.ticker)!) }}
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
                                    <template v-if="getGapPrice(source, item.ticker) !== null">
                                      {{
                                        formatPrice(getGapPrice(source, item.ticker)! * item.gap)
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
                                    <template v-if="getSourceOrderTotal(source) !== null">
                                      {{ formatPrice(getSourceOrderTotal(source)!) }}
                                      <span class="text-caption ml-1">
                                        {{ settingsStore.preferredCurrency.value }}
                                      </span>
                                    </template>
                                    <template v-else>–</template>
                                  </td>
                                  <td class="text-right">
                                    {{ formatWeight(getSourceOrderWeight(source)) }}
                                    <span class="text-caption">t</span>
                                  </td>
                                  <td class="text-right">
                                    {{ formatVolume(getSourceOrderVolume(source)) }}
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
                <div
                  class="resize-handle"
                  @mousedown="startResize($event, source.sourceLocationId)"
                >
                  <v-icon size="x-small" color="grey">mdi-drag-horizontal</v-icon>
                </div>

                <v-expansion-panels variant="accordion" style="padding: 0 12px">
                  <v-expansion-panel
                    v-for="planet in groupDestsByPlanet(source)"
                    :key="planet.planetId"
                  >
                    <v-expansion-panel-title>
                      <div
                        class="planet-panel-row"
                        :style="{
                          gridTemplateColumns: maxPlanetNameWidth(source) + 'ch 1fr auto',
                        }"
                      >
                        <span class="font-weight-medium planet-name">
                          {{ getLocationDisplay(planet.planetId) }}
                        </span>

                        <!-- Inline material icons grouped by category -->
                        <div class="d-inline-flex align-center planet-icons">
                          <template v-for="cat in planetCategories(planet.dests)" :key="cat">
                            <v-icon
                              size="x-small"
                              :class="[
                                cat !== planetCategories(planet.dests)[0] ? 'ml-3' : '',
                                'cat-icon',
                              ]"
                              :title="categoryLabel(cat)"
                              @click.stop="toggleExpandedCat(planet.planetId, cat)"
                            >
                              {{ getCategoryIcon(cat) }}
                            </v-icon>
                            <span
                              class="mat-icons"
                              :class="{
                                'mat-icons-expanded': isCatExpanded(planet.planetId, cat),
                              }"
                            >
                              <CommodityIcon
                                v-for="item in planetCategoryTickers(planet.dests, cat)"
                                :key="item.ticker"
                                :commodity="item"
                                class="ml-1 panel-commodity-icon"
                              />
                            </span>
                          </template>
                        </div>

                        <div class="d-flex justify-end">
                          <v-chip
                            v-if="planetGapCount(source, planet.dests) > 0"
                            size="small"
                            color="error"
                          >
                            {{ planetGapCount(source, planet.dests) }} gaps
                          </v-chip>
                        </div>
                      </div>
                    </v-expansion-panel-title>
                    <v-expansion-panel-text>
                      <!-- Filters: Category + Storage Type -->
                      <div class="d-flex align-center ga-1 mb-2 flex-wrap">
                        <v-btn
                          v-for="cat in planetCategories(planet.dests)"
                          :key="cat"
                          size="x-small"
                          :variant="
                            isPlanetFilterActive(planet.planetId, 'cat', cat) ? 'flat' : 'outlined'
                          "
                          :color="
                            isPlanetFilterActive(planet.planetId, 'cat', cat)
                              ? 'primary'
                              : undefined
                          "
                          @click="togglePlanetFilter(planet.planetId, 'cat', cat)"
                        >
                          <v-icon start size="small">{{ getCategoryIcon(cat) }}</v-icon>
                          {{ categoryLabel(cat) }}
                        </v-btn>
                        <v-divider vertical class="mx-1" />
                        <v-btn
                          v-for="st in planetStorageTypes(planet.dests)"
                          :key="st"
                          size="x-small"
                          :variant="
                            isPlanetFilterActive(planet.planetId, 'storage', st)
                              ? 'flat'
                              : 'outlined'
                          "
                          :color="
                            isPlanetFilterActive(planet.planetId, 'storage', st)
                              ? 'primary'
                              : undefined
                          "
                          @click="togglePlanetFilter(planet.planetId, 'storage', st)"
                        >
                          <v-icon start size="small">
                            {{ st === 'STORE' ? 'mdi-earth' : 'mdi-warehouse' }}
                          </v-icon>
                          {{ st === 'STORE' ? 'Base' : 'Warehouse' }}
                        </v-btn>
                      </div>

                      <!-- Aggregated table -->
                      <v-data-table
                        :headers="planetDetailHeaders"
                        :items="getPlanetMaterials(source, planet)"
                        density="compact"
                        :items-per-page="-1"
                        hide-default-footer
                        class="elevation-0"
                      >
                        <template #item.ticker="{ item }">
                          <CommodityDisplay :ticker="item.ticker" />
                        </template>

                        <template #item.storageIcons="{ item }">
                          <span class="d-inline-flex">
                            <v-icon
                              v-if="item.storageTypes.includes('WAREHOUSE_STORE')"
                              size="small"
                            >
                              mdi-warehouse
                            </v-icon>
                            <span v-else style="width: 20px" />
                            <v-icon
                              v-if="item.storageTypes.includes('STORE')"
                              size="small"
                              class="ml-1"
                            >
                              mdi-earth
                            </v-icon>
                            <span v-else style="width: 20px" class="ml-1" />
                          </span>
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

                        <template #item.needed="{ item }">
                          <span v-if="item.needed > 0" class="text-warning">
                            {{ item.needed }}
                          </span>
                          <span v-else class="text-success">0</span>
                        </template>

                        <template #item.gap="{ item }">
                          <span v-if="item.gap > 0" class="text-error font-weight-medium">
                            {{ item.gap }}
                          </span>
                          <span v-else class="text-success">0</span>
                        </template>

                        <template #no-data>
                          <div class="text-center py-2 text-medium-emphasis">No materials</div>
                        </template>
                      </v-data-table>
                    </v-expansion-panel-text>
                  </v-expansion-panel>
                </v-expansion-panels>
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
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

              <template #item.sources="{ item }">
                <v-chip v-for="src in item.sources" :key="src" size="x-small" class="mr-1">
                  {{ getLocationDisplay(src) }}
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
                <v-chip size="small" variant="outlined" class="font-weight-medium">1</v-chip>
                <span class="text-body-2 text-medium-emphasis" style="min-width: 75px">
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
                <v-chip size="small" variant="outlined" class="font-weight-medium">2</v-chip>
                <span class="text-body-2 text-medium-emphasis" style="min-width: 75px">
                  Destination
                </span>
                <KeyValueAutocomplete
                  v-model="addForm.destinationPlanetId"
                  :items="planetItems"
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
                <v-btn
                  v-else
                  size="small"
                  variant="outlined"
                  prepend-icon="mdi-close"
                  @click="exitEditMode"
                >
                  Cancel
                </v-btn>
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
              <CommodityDisplay :ticker="item.commodityTicker" />
            </template>

            <template #item.sourceLocationId="{ item }">
              {{ getLocationDisplay(item.sourceLocationId) }}
            </template>

            <template #item.destinationPlanetId="{ item }">
              {{ getLocationDisplay(item.destinationPlanetId) }}
            </template>

            <template #item.storageIcons="{ item }">
              <span class="d-inline-flex">
                <v-icon
                  v-if="(item.destinationStorageTypes as string[]).includes('WAREHOUSE_STORE')"
                  size="small"
                >
                  mdi-warehouse
                </v-icon>
                <span v-else style="width: 20px" />
                <v-icon
                  v-if="(item.destinationStorageTypes as string[]).includes('STORE')"
                  size="small"
                  class="ml-1"
                >
                  mdi-earth
                </v-icon>
                <span v-else style="width: 20px" class="ml-1" />
              </span>
            </template>

            <template #item.demandInfo="{ item }">
              {{ categoryLabel(item.demandSource) }}
            </template>

            <template #item.demandAmount="{ item }">
              <span v-if="item.demand !== null">{{ item.demand }}</span>
              <span v-else class="text-medium-emphasis">
                auto: {{ getCalculatedAmount(item) ?? '–' }}
              </span>
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
import type { SupplyDashboard, SourceDashboard, DestinationDashboard } from '@kawakawa/types'
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
const dashboard = ref<SupplyDashboard | null>(null)
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
  { title: 'Government', value: 'government' },
  { title: 'Other', value: 'other' },
]

const CATEGORY_LABELS: Record<string, string> = {
  consumables: 'Consumables',
  repair: 'Repair',
  inputs: 'Inputs',
  government: 'Government',
  other: 'Other',
}

const CATEGORY_ICONS: Record<string, string> = {
  consumables: 'mdi-fire',
  repair: 'mdi-wrench',
  inputs: 'mdi-factory',
  government: 'mdi-bank',
  other: 'mdi-dots-horizontal',
}

function getCategoryIcon(cat: string): string {
  return CATEGORY_ICONS[cat] ?? 'mdi-dots-horizontal'
}

const AUTO_CATEGORIES = new Set(['consumables', 'repair', 'inputs'])

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

  // Sync chips back to form fields (so add form stays in sync)
  suppressFormSync = true

  const sourceChip = chips.find(c => c.type === 'location')
  addForm.value.sourceLocationId = sourceChip?.value ?? ''

  // Second location chip = destination
  const locationChips = chips.filter(c => c.type === 'location')
  addForm.value.destinationPlanetId = locationChips.length > 1 ? locationChips[1].value : ''

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

const filteredCommodityItems = computed(() => {
  if (!AUTO_CATEGORIES.has(addForm.value.category) || !dashboard.value) return commodityItems.value

  // Collect tickers from dashboard for this category across matching destinations
  const tickers = new Set<string>()
  for (const src of dashboard.value.sources) {
    if (addForm.value.sourceLocationId && src.sourceLocationId !== addForm.value.sourceLocationId)
      continue
    for (const dest of src.destinations) {
      if (addForm.value.destinationPlanetId && dest.planetId !== addForm.value.destinationPlanetId)
        continue
      const items =
        addForm.value.category === 'consumables'
          ? dest.burn
          : addForm.value.category === 'repair'
            ? dest.repair
            : addForm.value.category === 'inputs'
              ? dest.production
              : []
      for (const item of items) tickers.add(item.ticker)
    }
  }

  if (tickers.size === 0) return commodityItems.value
  return commodityItems.value.filter(c => tickers.has(c.key))
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
  for (const src of dashboard.value.sources) {
    if (src.sourceLocationId !== line.sourceLocationId) continue
    for (const dest of src.destinations) {
      if (dest.planetId !== line.destinationPlanetId) continue
      const lists =
        line.demandSource === 'consumables'
          ? dest.burn
          : line.demandSource === 'repair'
            ? dest.repair
            : line.demandSource === 'inputs'
              ? dest.production
              : []
      const match = lists.find(item => item.ticker === line.commodityTicker)
      if (match) return match.need
    }
  }
  return null
}

function categoryLabel(source: string | null): string {
  if (!source) return '-'
  return CATEGORY_LABELS[source] ?? source
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

  // Location chips: first = source, second = destination
  const locationChips = chips.filter(c => c.type === 'location')
  if (locationChips.length > 0) {
    const sourceId = locationChips[0].value
    lines = lines.filter(l => l.sourceLocationId === sourceId)
  }
  if (locationChips.length > 1) {
    const destId = locationChips[1].value
    lines = lines.filter(l => l.destinationPlanetId === destId)
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
    lines = lines.filter(l => l.demandSource === categoryChip.value)
  }

  // Storage chips
  const storageChips = chips.filter(c => c.type === 'storage')
  if (storageChips.length > 0) {
    const selectedTypes = new Set(storageChips.map(c => c.value))
    lines = lines.filter(l =>
      (l.destinationStorageTypes as string[]).some(t => selectedTypes.has(t))
    )
  }

  return lines
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
watch(
  () => addForm.value.sourceLocationId,
  sourceId => {
    if (suppressFormSync || !linesSearchRef.value) return
    const ref = linesSearchRef.value
    // Remove old source location chip (first location chip)
    const existingLocations = linesSearchChips.value.filter(c => c.type === 'location')
    if (existingLocations.length > 0) {
      ref.removeChipByTypeValue('location', existingLocations[0].value)
    }
    if (sourceId) {
      // Insert source chip before any existing destination chip
      const destChip = linesSearchChips.value.find(c => c.type === 'location')
      if (destChip) {
        // Re-set all chips with source first
        const nonLocationChips = linesSearchChips.value.filter(c => c.type !== 'location')
        ref.setChips([
          { type: 'location', value: sourceId, display: getLocationDisplay(sourceId) },
          destChip,
          ...nonLocationChips,
        ])
      } else {
        ref.addChip({ type: 'location', value: sourceId, display: getLocationDisplay(sourceId) })
      }
    }
  }
)

watch(
  () => addForm.value.destinationPlanetId,
  destId => {
    if (suppressFormSync || !linesSearchRef.value) return
    const ref = linesSearchRef.value
    // Remove old destination chip (second location chip)
    const existingLocations = linesSearchChips.value.filter(c => c.type === 'location')
    if (existingLocations.length > 1) {
      ref.removeChipByTypeValue('location', existingLocations[1].value)
    }
    if (destId) {
      ref.addChip({ type: 'location', value: destId, display: getLocationDisplay(destId) })
    }
  }
)

// Table headers
const materialHeaders = [
  { title: 'Material', key: 'ticker', sortable: true },
  { title: 'Burn', key: 'burnNeed', sortable: true, align: 'end' as const },
  { title: 'Repair', key: 'repairNeed', sortable: true, align: 'end' as const },
  { title: 'Production', key: 'productionNeed', sortable: true, align: 'end' as const },
  { title: 'Need', key: 'totalNeed', sortable: true, align: 'end' as const },
  { title: 'On-site', key: 'destinationStock', sortable: true, align: 'end' as const },
  { title: 'Source', key: 'sourceStock', sortable: true, align: 'end' as const },
  { title: 'Gap', key: 'gap', sortable: true, align: 'end' as const },
  { title: 'Sources', key: 'sources', sortable: false },
]

const planetDetailHeaders = [
  { title: 'Material', key: 'ticker', sortable: true },
  { title: 'Category', key: 'category', sortable: false, width: 80 },
  { title: 'Storage', key: 'storageIcons', sortable: false, width: 60 },
  { title: 'Demand', key: 'need', sortable: true, align: 'end' as const },
  { title: 'On-site', key: 'destStock', sortable: true, align: 'end' as const },
  { title: 'Needed', key: 'needed', sortable: true, align: 'end' as const },
  { title: 'Source', key: 'srcStock', sortable: true, align: 'end' as const },
  { title: 'Gap', key: 'gap', sortable: true, align: 'end' as const },
]

interface DestMaterialRow {
  ticker: string
  categories: string[]
  storageTypes: string[]
  need: number
  destStock: number
  needed: number
  srcStock: number
  gap: number
}

// Per-destination category filter state
// Track expanded source panels — initialized from pageState, synced back on change
const expandedSourcePanels = reactive<Record<string, number[]>>({})
let expandedRestored = false

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

function getSourceCategories(source: SourceDashboard): string[] {
  const cats = new Set<string>()
  for (const dest of source.destinations) {
    if (dest.burn.length > 0) cats.add('consumables')
    if (dest.repair.length > 0) cats.add('repair')
    if (dest.production.length > 0) cats.add('inputs')
    if (dest.other.length > 0) cats.add('other')
  }
  return [...cats]
}

function getSourceStorageTypes(source: SourceDashboard): string[] {
  const types = new Set<string>()
  for (const dest of source.destinations) {
    for (const st of dest.destinationStorageTypes) types.add(st)
  }
  return [...types].sort()
}

function ensureSourceFilters(sourceId: string, source: SourceDashboard, side: FilterSide) {
  const store = getFilterStore(side)
  if (!store[sourceId]) {
    store[sourceId] = {
      cats: new Set(getSourceCategories(source)),
      storages: new Set(getSourceStorageTypes(source)),
    }
  }
  return store[sourceId]
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

/** Get tickers that pass the source-level category + storage filters */
function getSourceFilteredTickers(source: SourceDashboard, side: FilterSide): Set<string> {
  const f = ensureSourceFilters(source.sourceLocationId, source, side)
  const tickers = new Set<string>()
  for (const dest of source.destinations) {
    if (!dest.destinationStorageTypes.some(st => f.storages.has(st))) continue
    if (f.cats.has('consumables')) for (const item of dest.burn) tickers.add(item.ticker)
    if (f.cats.has('repair')) for (const item of dest.repair) tickers.add(item.ticker)
    if (f.cats.has('inputs')) for (const item of dest.production) tickers.add(item.ticker)
    if (f.cats.has('other')) for (const item of dest.other) tickers.add(item.ticker)
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

function getSortedSourceStock(source: SourceDashboard): SourceStockItem[] {
  const filteredTickers = getSourceFilteredTickers(source, 'stock')
  const items: SourceStockItem[] = Object.entries(source.sourceStock)
    .filter(([ticker]) => (source.aggregatedNeed[ticker] ?? 0) > 0 && filteredTickers.has(ticker))
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
  if (!sourceStockSort[source.sourceLocationId]) {
    sourceStockSort[source.sourceLocationId] = 'name'
  }

  const sortMode = sourceStockSort[source.sourceLocationId]
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

function getSourceGaps(source: SourceDashboard): { ticker: string; gap: number }[] {
  return Object.entries(source.gap)
    .filter(([, gap]) => gap > 0)
    .map(([ticker, gap]) => ({ ticker, gap }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker))
}

function getFilteredSourceGaps(source: SourceDashboard): { ticker: string; gap: number }[] {
  const filteredTickers = getSourceFilteredTickers(source, 'order')
  return getSourceGaps(source).filter(item => filteredTickers.has(item.ticker))
}

function getGapPrice(source: SourceDashboard, ticker: string): number | null {
  const prices = sourcePrices[source.sourceLocationId]
  return prices?.get(ticker) ?? null
}

function getSourceOrderTotal(source: SourceDashboard): number | null {
  const prices = sourcePrices[source.sourceLocationId]
  if (!prices || prices.size === 0) return null
  const gaps = getFilteredSourceGaps(source)
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

function getSourceOrderWeight(source: SourceDashboard): number {
  let total = 0
  for (const { ticker, gap } of getFilteredSourceGaps(source)) {
    const w = commodityService.getCommodityWeight(ticker)
    if (w) total += w * gap
  }
  return total
}

function getSourceOrderVolume(source: SourceDashboard): number {
  let total = 0
  for (const { ticker, gap } of getFilteredSourceGaps(source)) {
    const v = commodityService.getCommodityVolume(ticker)
    if (v) total += v * gap
  }
  return total
}

async function copySourceGapsCsv(source: SourceDashboard) {
  const gaps = getFilteredSourceGaps(source)
  if (gaps.length === 0) return
  const currency = settingsStore.preferredCurrency.value
  const lines = gaps.map(item => {
    const price = getGapPrice(source, item.ticker)
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

function createShoppingListFromGaps(source: SourceDashboard) {
  const gaps = getFilteredSourceGaps(source)
  if (gaps.length === 0) return
  const materials: Record<string, number> = {}
  for (const item of gaps) {
    materials[item.ticker] = item.gap
  }
  const locationName = getLocationDisplay(source.sourceLocationId)
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

async function loadSourcePrices(source: SourceDashboard) {
  const priceListCode = sourceOrderPriceList[source.sourceLocationId]
  if (!priceListCode) {
    delete sourcePrices[source.sourceLocationId]
    return
  }
  try {
    const currency = settingsStore.preferredCurrency.value
    const prices = await api.prices.getEffective(priceListCode, source.sourceLocationId, currency)
    const priceMap = new Map<string, number>()
    for (const p of prices) {
      priceMap.set(p.commodityTicker, p.finalPrice)
    }
    sourcePrices[source.sourceLocationId] = priceMap
  } catch {
    delete sourcePrices[source.sourceLocationId]
  }
}

// Watch price list changes to reload prices
watch(sourceOrderPriceList, () => {
  for (const source of dashboard.value?.sources ?? []) {
    loadSourcePrices(source)
  }
})

// Per-planet filters: enabled categories and storage types (all enabled by default)
const planetFilters = reactive<Record<string, { cats: Set<string>; storages: Set<string> }>>({})

function getPlanetFilters(planetId: string, dests: DestinationDashboard[]) {
  if (!planetFilters[planetId]) {
    planetFilters[planetId] = {
      cats: new Set(planetCategories(dests)),
      storages: new Set(planetStorageTypes(dests)),
    }
  }
  return planetFilters[planetId]
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

function planetStorageTypes(dests: DestinationDashboard[]): string[] {
  const types = new Set<string>()
  for (const dest of dests) {
    for (const st of dest.destinationStorageTypes) types.add(st)
  }
  return [...types]
}

function getPlanetMaterials(source: SourceDashboard, planet: PlanetGroup): DestMaterialRow[] {
  const filters = getPlanetFilters(planet.planetId, planet.dests)
  const agg = new Map<string, DestMaterialRow>()

  for (const dest of planet.dests) {
    // Check storage type filter
    if (!dest.destinationStorageTypes.some(st => filters.storages.has(st))) continue

    const rows = getDestMaterials(source, dest)

    for (const row of rows) {
      if (!row.categories.some(c => filters.cats.has(c))) continue
      const existing = agg.get(row.ticker)
      if (existing) {
        existing.need += row.need
        existing.destStock += row.destStock
        existing.needed = Math.max(0, existing.need - existing.destStock)
        existing.gap = Math.max(0, existing.needed - existing.srcStock)
        for (const st of row.storageTypes) {
          if (!existing.storageTypes.includes(st)) existing.storageTypes.push(st)
        }
        for (const cat of row.categories) {
          if (!existing.categories.includes(cat)) existing.categories.push(cat)
        }
      } else {
        agg.set(row.ticker, {
          ...row,
          storageTypes: [...row.storageTypes],
          categories: [...row.categories],
        })
      }
    }
  }

  return [...agg.values()]
}
const expandedCats = reactive<Record<string, boolean>>({})

function toggleExpandedCat(planetId: string, cat: string) {
  const key = `${planetId}:${cat}`
  expandedCats[key] = !expandedCats[key]
}

function isCatExpanded(planetId: string, cat: string): boolean {
  return !!expandedCats[`${planetId}:${cat}`]
}

interface PlanetGroup {
  planetId: string
  dests: DestinationDashboard[]
}

function maxPlanetNameWidth(source: SourceDashboard): number {
  let max = 0
  const seen = new Set<string>()
  for (const dest of source.destinations) {
    if (seen.has(dest.planetId)) continue
    seen.add(dest.planetId)
    const name = getLocationDisplay(dest.planetId)
    if (name.length > max) max = name.length
  }
  return max
}

function groupDestsByPlanet(source: SourceDashboard): PlanetGroup[] {
  const groups = new Map<string, DestinationDashboard[]>()
  for (const dest of source.destinations) {
    const dests = groups.get(dest.planetId) ?? []
    dests.push(dest)
    groups.set(dest.planetId, dests)
  }
  return [...groups.entries()].map(([planetId, dests]) => ({ planetId, dests }))
}

function planetCategories(dests: DestinationDashboard[]): string[] {
  const cats = new Set<string>()
  for (const dest of dests) {
    for (const cat of destCategories(dest)) cats.add(cat)
  }
  return [...cats]
}

function planetCategoryTickers(dests: DestinationDashboard[], cat: string): Commodity[] {
  const seen = new Set<string>()
  const result: Commodity[] = []
  for (const dest of dests) {
    for (const item of destCategoryTickers(dest, cat)) {
      if (!seen.has(item.ticker)) {
        seen.add(item.ticker)
        result.push(item)
      }
    }
  }
  return result
}

function planetGapCount(source: SourceDashboard, dests: DestinationDashboard[]): number {
  const tickers = new Set<string>()
  for (const dest of dests) {
    for (const cat of destCategories(dest)) {
      for (const item of destCategoryTickers(dest, cat)) {
        tickers.add(item.ticker)
      }
    }
  }
  return [...tickers].filter(t => (source.gap[t] ?? 0) > 0).length
}

function getGovTickers(dest: DestinationDashboard): Set<string> {
  return new Set(
    allLines.value
      .filter(l => l.destinationPlanetId === dest.planetId && l.demandSource === 'government')
      .map(l => l.commodityTicker)
  )
}

function destCategories(dest: DestinationDashboard): string[] {
  const cats: string[] = []
  if (dest.burn.some(b => b.need > 0)) cats.push('consumables')
  if (dest.repair.some(r => r.need > 0)) cats.push('repair')
  if (dest.production.some(p => p.need > 0)) cats.push('inputs')
  if (dest.other.some(o => o.need > 0)) {
    const govTickers = getGovTickers(dest)
    if (dest.other.some(o => o.need > 0 && govTickers.has(o.ticker))) cats.push('government')
    if (dest.other.some(o => o.need > 0 && !govTickers.has(o.ticker))) cats.push('other')
  }
  return cats
}

function destCategoryTickers(dest: DestinationDashboard, cat: string): Commodity[] {
  let items: { ticker: string; need: number }[]
  if (cat === 'consumables') {
    items = dest.burn
  } else if (cat === 'repair') {
    items = dest.repair
  } else if (cat === 'inputs') {
    items = dest.production
  } else if (cat === 'government') {
    const govTickers = getGovTickers(dest)
    items = dest.other.filter(o => govTickers.has(o.ticker))
  } else {
    const govTickers = getGovTickers(dest)
    items = dest.other.filter(o => !govTickers.has(o.ticker))
  }
  return items
    .filter(i => i.need > 0)
    .map(i => ({
      ticker: i.ticker,
      name: commodityService.getCommodityDisplay(i.ticker, 'name-only'),
      category: commodityService.getCommodityCategory(i.ticker) ?? undefined,
    }))
}

function getDestMaterials(
  source: SourceDashboard,
  dest: DestinationDashboard,
  filter?: string | null
): DestMaterialRow[] {
  const rows: DestMaterialRow[] = []

  function addRows(items: { ticker: string; need: number }[], category: string) {
    if (filter && filter !== category) return
    for (const item of items) {
      if (item.need <= 0) continue
      const destStock = dest.destinationStock[item.ticker] ?? 0
      const needed = Math.max(0, item.need - destStock)
      const srcStock = source.sourceStock[item.ticker] ?? 0
      rows.push({
        ticker: item.ticker,
        categories: [category],
        storageTypes: [...dest.destinationStorageTypes],
        need: item.need,
        destStock,
        needed,
        srcStock,
        gap: Math.max(0, needed - srcStock),
      })
    }
  }

  addRows(dest.burn, 'consumables')
  addRows(dest.repair, 'repair')
  addRows(dest.production, 'inputs')
  const govTickers = getGovTickers(dest)
  addRows(
    dest.other.filter(o => govTickers.has(o.ticker)),
    'government'
  )
  addRows(
    dest.other.filter(o => !govTickers.has(o.ticker)),
    'other'
  )
  return rows
}

const configHeaders = [
  { title: 'Material', key: 'commodityTicker', sortable: true },
  { title: 'Source', key: 'sourceLocationId', sortable: true },
  { title: 'Destination', key: 'destinationPlanetId', sortable: true },
  { title: 'Storage', key: 'storageIcons', sortable: false, width: 70 },
  { title: 'Category', key: 'demandInfo', sortable: true },
  { title: 'Amount', key: 'demandAmount', sortable: false },
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
    const [dashData, planetData, lineData, locData] = await Promise.all([
      api.supplyDashboard.get(),
      api.supplyDashboard.getPlanets(),
      api.supplyChain.list(),
      api.supplyChain.getLocations(),
    ])
    dashboard.value = dashData
    planets.value = planetData
    allLines.value = lineData
    storageLocations.value = locData
    await Promise.all([loadLocationItems(), loadCommodityItems(), loadPriceLists()])

    // Initialize price list defaults for each source
    const defaultPL = settingsStore.defaultPriceList.value
    for (const src of dashData.sources) {
      if (!(src.sourceLocationId in sourceOrderPriceList)) {
        sourceOrderPriceList[src.sourceLocationId] = defaultPL
      }
    }
    // Load prices for sources with a selected price list
    for (const src of dashData.sources) {
      if (sourceOrderPriceList[src.sourceLocationId]) {
        loadSourcePrices(src)
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
async function bulkAdd(type: 'consumables' | 'repair' | 'inputs') {
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
    else result = await api.supplyChain.addInputs(request)

    showSnackbar(`Added ${result.created} lines, skipped ${result.skipped}`)
    allLines.value = await api.supplyChain.list()
    // Reload dashboard to reflect changes
    dashboard.value = await api.supplyDashboard.get()
  } catch (error) {
    showSnackbar(error instanceof Error ? error.message : `Failed to add ${type} lines`, 'error')
  } finally {
    bulkAdding.value = false
  }
}

function enterEditMode() {
  editMode.value = true
  selectedLineIds.value = []
}

function exitEditMode() {
  editMode.value = false
  selectedLineIds.value = []
}

function selectAllLines() {
  selectedLineIds.value = filteredLines.value.map(l => l.id)
}

async function handleAdd() {
  const cat = addForm.value.category as 'consumables' | 'inputs' | 'repair' | 'government' | 'other'

  // Bulk add (All materials, auto amount)
  if (addForm.value.materialAll && AUTO_CATEGORIES.has(cat)) {
    await bulkAdd(cat as 'consumables' | 'repair' | 'inputs')
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
      demandSource: cat,
      demand: addForm.value.amountAuto ? undefined : (addForm.value.addAmount ?? undefined),
    })
    showSnackbar('Line added')
    addForm.value.addTicker = ''
    addForm.value.addAmount = null
    allLines.value = await api.supplyChain.list()
    dashboard.value = await api.supplyDashboard.get()
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
    dashboard.value = await api.supplyDashboard.get()
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
