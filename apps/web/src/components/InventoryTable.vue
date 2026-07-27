<template>
  <v-card>
    <v-card-title class="d-flex align-center">
      <span class="text-body-2 text-medium-emphasis mr-2"> {{ items.length }} item(s) </span>
    </v-card-title>

    <v-data-table
      v-model:expanded="expandedItems"
      v-model:sort-by="sortByModel"
      :headers="headers"
      :items="items"
      :loading="loading"
      :items-per-page="25"
      :row-props="getRowProps"
      item-value="id"
      show-expand
      :class="['elevation-0', { 'icon-rows': hasIcons }]"
    >
      <!-- Custom expand toggle with sell order count -->
      <template #item.data-table-expand="{ item, internalItem, isExpanded, toggleExpand }">
        <div class="d-flex align-center ga-1">
          <v-btn
            v-if="getSellOrders(item).length > 0 || getBuyOrders(item).length > 0"
            icon
            variant="text"
            size="small"
            @click="toggleExpand(internalItem)"
          >
            <v-icon>{{
              isExpanded(internalItem) ? 'mdi-chevron-down' : 'mdi-chevron-right'
            }}</v-icon>
          </v-btn>
          <div v-else style="width: 32px"></div>
          <v-chip
            v-if="getSellOrders(item).length > 0"
            size="x-small"
            color="success"
            variant="tonal"
          >
            {{ getSellOrders(item).length }}
          </v-chip>
        </div>
      </template>

      <template #item.commodityTicker="{ item }">
        <div
          class="font-weight-medium clickable-cell"
          @click="$emit('filter-commodity', item.commodityTicker)"
        >
          <CommodityDisplay :ticker="item.commodityTicker" />
        </div>
      </template>

      <template #item.commodityCategory="{ item }">
        <span
          v-if="item.commodityCategory"
          class="clickable-cell"
          @click="$emit('filter-category', item.commodityCategory)"
        >
          {{ localizeMaterialCategory(item.commodityCategory! as CommodityCategory) }}
        </span>
      </template>

      <template #item.locationId="{ item }">
        <div
          class="font-weight-medium clickable-cell"
          @click="item.locationId && $emit('filter-location', item.locationId)"
        >
          {{ getLocationDisplay(item.locationId) }}
        </div>
        <div class="text-caption text-medium-emphasis">
          <span class="clickable-cell" @click="$emit('filter-storageType', item.storageType)">
            {{ formatStorageType(item.storageType) }}
          </span>
          &bull;
          <span
            class="clickable-cell"
            @click="item.locationType && $emit('filter-locationType', item.locationType)"
          >
            {{ item.locationType || 'Unknown' }}
          </span>
        </div>
      </template>

      <template #item.quantity="{ item }">
        <span class="font-weight-medium">{{ item.quantity.toLocaleString() }}</span>
      </template>

      <template #item.fioUploadedAt="{ item }">
        <FioAgeChip :fio-uploaded-at="item.fioUploadedAt" color-mode="syncStatus" empty-text="-" />
      </template>

      <template #item.actions="{ item }">
        <!-- Desktop: show buttons -->
        <div class="d-none d-sm-flex ga-1">
          <v-tooltip location="top" text="Find buyers for this item">
            <template #activator="{ props: tooltipProps }">
              <v-btn
                v-bind="tooltipProps"
                color="info"
                size="small"
                variant="tonal"
                @click="$emit('find-buyers', item)"
              >
                <v-icon start size="small">mdi-account-search</v-icon>
                Buyers
              </v-btn>
            </template>
          </v-tooltip>
          <v-tooltip
            location="top"
            :text="
              canCreateOrders ? 'Create sell order' : 'You do not have permission to create orders'
            "
          >
            <template #activator="{ props: tooltipProps }">
              <v-btn
                v-bind="tooltipProps"
                color="success"
                size="small"
                variant="tonal"
                :disabled="!canCreateOrders"
                @click="$emit('sell', item)"
              >
                Sell
              </v-btn>
            </template>
          </v-tooltip>
        </div>
        <!-- Mobile: show menu -->
        <v-menu>
          <template #activator="{ props: menuProps }">
            <v-btn v-bind="menuProps" icon size="small" class="d-sm-none">
              <v-icon>mdi-dots-vertical</v-icon>
            </v-btn>
          </template>
          <v-list density="compact">
            <v-list-item @click="$emit('find-buyers', item)">
              <template #prepend>
                <v-icon color="info">mdi-account-search</v-icon>
              </template>
              <v-list-item-title>Find Buyers</v-list-item-title>
            </v-list-item>
            <v-tooltip
              :disabled="canCreateOrders"
              text="You do not have permission to create orders"
              location="start"
            >
              <template #activator="{ props: tooltipProps }">
                <v-list-item
                  v-bind="tooltipProps"
                  :disabled="!canCreateOrders"
                  @click="$emit('sell', item)"
                >
                  <template #prepend>
                    <v-icon color="success">mdi-tag</v-icon>
                  </template>
                  <v-list-item-title>Create Sell Order</v-list-item-title>
                </v-list-item>
              </template>
            </v-tooltip>
          </v-list>
        </v-menu>
      </template>

      <!-- Expanded row showing existing orders -->
      <template #expanded-row="{ item, columns }">
        <tr class="expanded-row">
          <td :colspan="columns.length" class="pa-0">
            <InventoryExpandedOrders
              :sell-orders="getSellOrders(item)"
              :buy-orders="getBuyOrders(item)"
              @view-sell="$emit('view-sell', $event)"
              @view-buy="$emit('view-buy', $event)"
              @edit-sell="$emit('edit-sell', $event)"
              @edit-buy="$emit('edit-buy', $event)"
              @delete-sell="$emit('delete-sell', $event)"
              @delete-buy="$emit('delete-buy', $event)"
            />
          </td>
        </tr>
      </template>

      <template #no-data>
        <slot name="no-data" />
      </template>
    </v-data-table>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import {
  type FioInventoryItem,
  type SellOrderResponse,
  type BuyOrderResponse,
} from '../services/api'
import { useDisplayHelpers } from '../composables'
import CommodityDisplay from './CommodityDisplay.vue'
import FioAgeChip from './FioAgeChip.vue'
import InventoryExpandedOrders from './InventoryExpandedOrders.vue'
import { localizeMaterialCategory } from '../utils/materials'
import { formatStorageType } from '../utils/locationUtils'
import type { CommodityCategory } from '@kawakawa/types'

type SortItem = { key: string; order: 'asc' | 'desc' }

const props = defineProps<{
  items: FioInventoryItem[]
  loading: boolean
  sellOrders: SellOrderResponse[]
  buyOrders: BuyOrderResponse[]
  canCreateOrders: boolean
  hasIcons: boolean
  sortBy?: SortItem[]
}>()

const emit = defineEmits<{
  'update:sortBy': [value: SortItem[]]
  sell: [item: FioInventoryItem]
  'find-buyers': [item: FioInventoryItem]
  'view-sell': [order: SellOrderResponse]
  'view-buy': [order: BuyOrderResponse]
  'edit-sell': [order: SellOrderResponse]
  'edit-buy': [order: BuyOrderResponse]
  'delete-sell': [order: SellOrderResponse]
  'delete-buy': [order: BuyOrderResponse]
  'filter-commodity': [ticker: string]
  'filter-category': [category: string]
  'filter-location': [locationId: string]
  'filter-storageType': [storageType: string]
  'filter-locationType': [locationType: string]
}>()

const { getLocationDisplay } = useDisplayHelpers()

const expandedItems = ref<string[]>([])

const sortByModel = computed({
  get: () => props.sortBy ?? [],
  set: (value: SortItem[]) => emit('update:sortBy', value),
})

const headers = [
  { title: '', key: 'data-table-expand', sortable: false, width: 80 },
  { title: 'Commodity', key: 'commodityTicker', sortable: true },
  { title: 'Category', key: 'commodityCategory', sortable: true },
  { title: 'Location', key: 'locationId', sortable: true },
  { title: 'FIO Age', key: 'fioUploadedAt', sortable: true },
  { title: 'Quantity', key: 'quantity', sortable: true, align: 'end' as const },
  { title: 'Actions', key: 'actions', sortable: false, width: 100 },
]

const getSellOrders = (item: FioInventoryItem): SellOrderResponse[] => {
  return props.sellOrders.filter(
    order =>
      order.commodityTicker === item.commodityTicker &&
      order.locationId === item.locationId &&
      // Match storage type: order.storageType === null means "all storage", otherwise must match exactly
      (order.storageType === null || order.storageType === item.storageType)
  )
}

const getBuyOrders = (item: FioInventoryItem): BuyOrderResponse[] => {
  return props.buyOrders.filter(
    order => order.commodityTicker === item.commodityTicker && order.locationId === item.locationId
  )
}

const getRowProps = ({ index }: { index: number }) => {
  return { class: index % 2 === 1 ? 'alt-row' : '' }
}
</script>

<style scoped>
.clickable-cell {
  cursor: pointer;
  transition: color 0.2s;
}

.clickable-cell:hover {
  color: rgb(var(--v-theme-primary));
  text-decoration: underline;
}
</style>

<style>
/* Unscoped: taller rows when icons are enabled */
.icon-rows tbody tr td {
  height: 64px !important;
}

/* Alternating row colors */
.alt-row {
  background-color: rgba(var(--v-theme-on-surface), 0.03) !important;
}
</style>
