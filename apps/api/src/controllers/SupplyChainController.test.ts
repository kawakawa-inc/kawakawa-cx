import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SupplyChainController } from './SupplyChainController.js'

// Mock DB
const mockSelectFrom = vi.fn()
const mockSelectWhere = vi.fn()
const mockInsertValues = vi.fn()
const mockInsertReturning = vi.fn()
const mockUpdateSet = vi.fn()
const mockUpdateWhere = vi.fn()
const mockDeleteWhere = vi.fn()

vi.mock('../db/index.js', () => ({
  db: {
    select: vi.fn(() => ({ from: mockSelectFrom })),
    selectDistinct: vi.fn(() => ({ from: mockSelectFrom })),
    insert: vi.fn(() => ({ values: mockInsertValues })),
    update: vi.fn(() => ({ set: mockUpdateSet })),
    delete: vi.fn(() => ({ where: mockDeleteWhere })),
  },
  supplyChainLines: {
    id: 'id',
    userId: 'userId',
    commodityTicker: 'commodityTicker',
    sourceLocationId: 'sourceLocationId',
    sourceStorageTypes: 'sourceStorageTypes',
    destinationPlanetId: 'destinationPlanetId',
    destinationStorageTypes: 'destinationStorageTypes',
    mode: 'mode',
    demandSource: 'demandSource',
    demand: 'demand',
    createdAt: 'createdAt',
    updatedAt: 'updatedAt',
  },
  fioCommodities: { ticker: 'ticker' },
  fioLocations: { naturalId: 'naturalId' },
  fioUserPlanets: { id: 'id', userId: 'userId', planetNaturalId: 'planetNaturalId' },
  fioPlanetWorkforce: { userPlanetId: 'userPlanetId', needs: 'needs' },
  fioPlanetBuildings: {
    userPlanetId: 'userPlanetId',
    buildingTicker: 'buildingTicker',
    buildingCreated: 'buildingCreated',
    buildingLastRepair: 'buildingLastRepair',
    condition: 'condition',
    repairMaterials: 'repairMaterials',
    reclaimableMaterials: 'reclaimableMaterials',
  },
  fioPlanetProduction: { userPlanetId: 'userPlanetId', orders: 'orders' },
  fioUserStorage: { userId: 'userId', locationId: 'locationId', type: 'type' },
}))

vi.mock('../services/userSettingsService.js', () => ({
  getSetting: vi.fn().mockResolvedValue(0),
}))

const mockCalculateBuildingRepairNeeds = vi.fn()
vi.mock('../services/supply-calculator.js', () => ({
  calculateBuildingRepairNeeds: (...args: unknown[]) => mockCalculateBuildingRepairNeeds(...args),
}))

const mockGetBuildings = vi.fn()
vi.mock('../services/fio/client.js', () => ({
  FioClient: class MockFioClient {
    getBuildings = mockGetBuildings
  },
}))

describe('SupplyChainController', () => {
  let controller: SupplyChainController
  const mockRequest = { user: { userId: 1, username: 'testuser', roles: ['member'] } }
  const now = new Date('2025-01-15T12:00:00Z')

  function makeLine(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      id: 1,
      userId: 1,
      commodityTicker: 'DW',
      sourceLocationId: 'BEN',
      sourceStorageTypes: ['STORE'],
      destinationPlanetId: 'UV-351a',
      destinationStorageTypes: ['STORE'],
      mode: 'demand' as const,
      demandSource: 'consumables' as const,
      demand: null,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    controller = new SupplyChainController()

    mockSelectFrom.mockReturnValue({ where: mockSelectWhere })
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning })
    mockUpdateSet.mockReturnValue({ where: mockUpdateWhere })
    mockUpdateWhere.mockResolvedValue(undefined)
    mockDeleteWhere.mockResolvedValue(undefined)

    // Default: all building tickers are repairable (tests override when needed)
    mockGetBuildings.mockResolvedValue([
      { Ticker: 'CHP', Pioneers: 0, Settlers: 100, Technicians: 0, Engineers: 0, Scientists: 0 },
      { Ticker: 'FP', Pioneers: 100, Settlers: 0, Technicians: 0, Engineers: 0, Scientists: 0 },
      { Ticker: 'COL', Pioneers: 40, Settlers: 0, Technicians: 0, Engineers: 0, Scientists: 0 },
    ])
  })

  // ==================== GET /supply-chain ====================

  describe('getLines', () => {
    it('should return all lines for the user', async () => {
      const lines = [makeLine(), makeLine({ id: 2, commodityTicker: 'RAT' })]
      mockSelectWhere.mockResolvedValueOnce(lines)

      const result = await controller.getLines(mockRequest)

      expect(result).toHaveLength(2)
      expect(result[0].commodityTicker).toBe('DW')
      expect(result[0].createdAt).toBe('2025-01-15T12:00:00.000Z')
      expect(result[1].commodityTicker).toBe('RAT')
    })

    it('should return empty array when no lines exist', async () => {
      mockSelectWhere.mockResolvedValueOnce([])

      const result = await controller.getLines(mockRequest)

      expect(result).toHaveLength(0)
    })
  })

  // ==================== GET /supply-chain/source/{sourceLocationId} ====================

  describe('getLinesBySource', () => {
    it('should return lines filtered by source location', async () => {
      mockSelectWhere.mockResolvedValueOnce([makeLine()])

      const result = await controller.getLinesBySource('BEN', mockRequest)

      expect(result).toHaveLength(1)
      expect(result[0].sourceLocationId).toBe('BEN')
    })
  })

  // ==================== POST /supply-chain/lines ====================

  describe('createLine', () => {
    it('should create a demand line with demandSource', async () => {
      // commodity exists
      mockSelectWhere.mockResolvedValueOnce([{ ticker: 'DW' }])
      // location exists
      mockSelectWhere.mockResolvedValueOnce([{ naturalId: 'BEN' }])

      mockInsertReturning.mockResolvedValueOnce([makeLine()])

      const result = await controller.createLine(
        {
          commodityTicker: 'DW',
          sourceLocationId: 'BEN',
          sourceStorageTypes: ['STORE'],
          destinationPlanetId: 'UV-351a',
          destinationStorageTypes: ['STORE'],
          mode: 'demand',
          demandSource: 'consumables',
        },
        mockRequest
      )

      expect(result.id).toBe(1)
      expect(result.mode).toBe('demand')
      expect(result.demandSource).toBe('consumables')
    })

    it('should create a demand line with fixed demand', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ ticker: 'DW' }])
      mockSelectWhere.mockResolvedValueOnce([{ naturalId: 'BEN' }])

      const line = makeLine({ demandSource: null, demand: 500 })
      mockInsertReturning.mockResolvedValueOnce([line])

      const result = await controller.createLine(
        {
          commodityTicker: 'DW',
          sourceLocationId: 'BEN',
          sourceStorageTypes: ['STORE'],
          destinationPlanetId: 'UV-351a',
          destinationStorageTypes: ['STORE'],
          mode: 'demand',
          demand: 500,
        },
        mockRequest
      )

      expect(result.demand).toBe(500)
      expect(result.demandSource).toBeNull()
    })

    it('should create a reserve line', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ ticker: 'DW' }])
      mockSelectWhere.mockResolvedValueOnce([{ naturalId: 'BEN' }])

      const line = makeLine({ mode: 'reserve', demandSource: null, demand: 2000 })
      mockInsertReturning.mockResolvedValueOnce([line])

      const result = await controller.createLine(
        {
          commodityTicker: 'DW',
          sourceLocationId: 'BEN',
          sourceStorageTypes: ['STORE'],
          destinationPlanetId: 'UV-351a',
          destinationStorageTypes: ['STORE'],
          mode: 'reserve',
          demand: 2000,
        },
        mockRequest
      )

      expect(result.mode).toBe('reserve')
      expect(result.demand).toBe(2000)
    })

    it('should reject invalid commodity ticker', async () => {
      mockSelectWhere.mockResolvedValueOnce([]) // commodity not found

      await expect(
        controller.createLine(
          {
            commodityTicker: 'INVALID',
            sourceLocationId: 'BEN',
            sourceStorageTypes: ['STORE'],
            destinationPlanetId: 'UV-351a',
            destinationStorageTypes: ['STORE'],
            mode: 'demand',
            demandSource: 'consumables',
          },
          mockRequest
        )
      ).rejects.toThrow('Invalid commodity ticker')
    })

    it('should reject invalid source location', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ ticker: 'DW' }]) // commodity ok
      mockSelectWhere.mockResolvedValueOnce([]) // location not found

      await expect(
        controller.createLine(
          {
            commodityTicker: 'DW',
            sourceLocationId: 'NOWHERE',
            sourceStorageTypes: ['STORE'],
            destinationPlanetId: 'UV-351a',
            destinationStorageTypes: ['STORE'],
            mode: 'demand',
            demandSource: 'consumables',
          },
          mockRequest
        )
      ).rejects.toThrow('Invalid source location')
    })

    it('should reject reserve line with demandSource', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ ticker: 'DW' }])
      mockSelectWhere.mockResolvedValueOnce([{ naturalId: 'BEN' }])

      await expect(
        controller.createLine(
          {
            commodityTicker: 'DW',
            sourceLocationId: 'BEN',
            sourceStorageTypes: ['STORE'],
            destinationPlanetId: 'UV-351a',
            destinationStorageTypes: ['STORE'],
            mode: 'reserve',
            demandSource: 'consumables',
          },
          mockRequest
        )
      ).rejects.toThrow('Reserve lines cannot have a demandSource')
    })

    it('should reject demand line without demandSource or demand', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ ticker: 'DW' }])
      mockSelectWhere.mockResolvedValueOnce([{ naturalId: 'BEN' }])

      await expect(
        controller.createLine(
          {
            commodityTicker: 'DW',
            sourceLocationId: 'BEN',
            sourceStorageTypes: ['STORE'],
            destinationPlanetId: 'UV-351a',
            destinationStorageTypes: ['STORE'],
            mode: 'demand',
          },
          mockRequest
        )
      ).rejects.toThrow('Demand lines require either a category or a fixed demand amount')
    })

    it('should reject empty sourceStorageTypes', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ ticker: 'DW' }])
      mockSelectWhere.mockResolvedValueOnce([{ naturalId: 'BEN' }])

      await expect(
        controller.createLine(
          {
            commodityTicker: 'DW',
            sourceLocationId: 'BEN',
            sourceStorageTypes: [],
            destinationPlanetId: 'UV-351a',
            destinationStorageTypes: ['STORE'],
            mode: 'demand',
            demandSource: 'consumables',
          },
          mockRequest
        )
      ).rejects.toThrow('sourceStorageTypes must not be empty')
    })
  })

  // ==================== PUT /supply-chain/lines/{id} ====================

  describe('updateLine', () => {
    it('should update storage types and demand', async () => {
      const existing = makeLine()
      // First query: find existing
      mockSelectWhere.mockResolvedValueOnce([existing])
      // After update: re-fetch
      const updated = makeLine({
        sourceStorageTypes: ['STORE', 'WAREHOUSE_STORE'],
        demand: 100,
      })
      mockSelectWhere.mockResolvedValueOnce([updated])

      const result = await controller.updateLine(
        1,
        { sourceStorageTypes: ['STORE', 'WAREHOUSE_STORE'], demand: 100 },
        mockRequest
      )

      expect(result.sourceStorageTypes).toEqual(['STORE', 'WAREHOUSE_STORE'])
      expect(result.demand).toBe(100)
    })

    it('should throw NotFound for non-existent line', async () => {
      mockSelectWhere.mockResolvedValueOnce([])

      await expect(controller.updateLine(999, { demand: 100 }, mockRequest)).rejects.toThrow(
        'Supply chain line not found'
      )
    })

    it('should reject empty sourceStorageTypes', async () => {
      mockSelectWhere.mockResolvedValueOnce([makeLine()])

      await expect(
        controller.updateLine(1, { sourceStorageTypes: [] }, mockRequest)
      ).rejects.toThrow('sourceStorageTypes must not be empty')
    })
  })

  // ==================== DELETE /supply-chain/lines/{id} ====================

  describe('deleteLine', () => {
    it('should delete a line', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 1 }])

      const result = await controller.deleteLine(1, mockRequest)

      expect(result.success).toBe(true)
    })

    it('should throw NotFound for non-existent line', async () => {
      mockSelectWhere.mockResolvedValueOnce([])

      await expect(controller.deleteLine(999, mockRequest)).rejects.toThrow(
        'Supply chain line not found'
      )
    })
  })

  // ==================== DELETE /supply-chain/source/{sourceLocationId}/{destinationPlanetId} ====================

  describe('clearLines', () => {
    it('should delete all lines for a source-destination pair', async () => {
      mockSelectWhere.mockResolvedValueOnce([
        { id: 1, destinationStorageTypes: ['STORE'] },
        { id: 2, destinationStorageTypes: ['STORE'] },
        { id: 3, destinationStorageTypes: ['STORE'] },
      ])

      const result = await controller.clearLines('BEN', 'UV-351a', undefined, mockRequest)

      expect(result.deleted).toBe(3)
    })

    it('should return 0 when no lines to delete', async () => {
      mockSelectWhere.mockResolvedValueOnce([])

      const result = await controller.clearLines('BEN', 'UNKNOWN', undefined, mockRequest)

      expect(result.deleted).toBe(0)
    })
  })

  // ==================== POST /supply-chain/add-consumables ====================

  describe('addConsumableLines', () => {
    it('should create lines for each workforce consumable material with burn rate > 0', async () => {
      // Planet lookup
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }])
      // Storage types at source (BEN) and destination (UV-351a)
      mockSelectWhere.mockResolvedValueOnce([{ type: 'WAREHOUSE_STORE' }])
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }])
      // Workforce data (includes zero-rate needs that should be skipped)
      mockSelectWhere.mockResolvedValueOnce([
        {
          needs: [
            { MaterialTicker: 'DW', UnitsPerInterval: 42.8 },
            { MaterialTicker: 'RAT', UnitsPerInterval: 6.0 },
            { MaterialTicker: 'DW', UnitsPerInterval: 10.0 }, // duplicate should be deduped
            { MaterialTicker: 'FIM', UnitsPerInterval: 0.0 }, // zero rate, should be skipped
          ],
        },
        {
          needs: [
            { MaterialTicker: 'COF', UnitsPerInterval: 2.5 },
            { MaterialTicker: 'HSS', UnitsPerInterval: 0 }, // zero rate, should be skipped
          ],
        },
      ])
      // Existing lines check (none)
      mockSelectWhere.mockResolvedValueOnce([])

      const inserted = [
        makeLine({ id: 1, commodityTicker: 'DW' }),
        makeLine({ id: 2, commodityTicker: 'RAT' }),
        makeLine({ id: 3, commodityTicker: 'COF' }),
      ]
      mockInsertReturning.mockResolvedValueOnce(inserted)

      const result = await controller.addConsumableLines(
        { sourceLocationId: 'BEN', destinationPlanetId: 'UV-351a' },
        mockRequest
      )

      expect(result.created).toBe(3)
      expect(result.skipped).toBe(0)
      expect(result.lines).toHaveLength(3)
    })

    it('should skip already existing lines', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }]) // planet
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // source storage
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // dest storage
      mockSelectWhere.mockResolvedValueOnce([
        {
          needs: [
            { MaterialTicker: 'DW', UnitsPerInterval: 42.8 },
            { MaterialTicker: 'RAT', UnitsPerInterval: 6.0 },
          ],
        },
      ])
      // DW already exists
      mockSelectWhere.mockResolvedValueOnce([{ commodityTicker: 'DW' }])

      const inserted = [makeLine({ id: 2, commodityTicker: 'RAT' })]
      mockInsertReturning.mockResolvedValueOnce(inserted)

      const result = await controller.addConsumableLines(
        { sourceLocationId: 'BEN', destinationPlanetId: 'UV-351a' },
        mockRequest
      )

      expect(result.created).toBe(1)
      expect(result.skipped).toBe(1)
    })

    it('should return empty when planet has no workforce needs', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }]) // planet
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // source storage
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // dest storage
      mockSelectWhere.mockResolvedValueOnce([]) // no workforce

      const result = await controller.addConsumableLines(
        { sourceLocationId: 'BEN', destinationPlanetId: 'UV-351a' },
        mockRequest
      )

      expect(result.created).toBe(0)
      expect(result.skipped).toBe(0)
    })

    it('should throw NotFound when planet not synced', async () => {
      mockSelectWhere.mockResolvedValueOnce([]) // planet not found

      await expect(
        controller.addConsumableLines(
          { sourceLocationId: 'BEN', destinationPlanetId: 'UNKNOWN' },
          mockRequest
        )
      ).rejects.toThrow('Planet UNKNOWN not found')
    })

    it('should use detected storage types when not specified', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }]) // planet
      mockSelectWhere.mockResolvedValueOnce([{ type: 'WAREHOUSE_STORE' }]) // source storage
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // dest storage
      mockSelectWhere.mockResolvedValueOnce([
        { needs: [{ MaterialTicker: 'DW', UnitsPerInterval: 42.8 }] },
      ])
      mockSelectWhere.mockResolvedValueOnce([]) // no existing

      const inserted = [makeLine({ sourceStorageTypes: ['STORE'] })]
      mockInsertReturning.mockResolvedValueOnce(inserted)

      const result = await controller.addConsumableLines(
        { sourceLocationId: 'BEN', destinationPlanetId: 'UV-351a' },
        mockRequest
      )

      expect(result.lines[0].sourceStorageTypes).toEqual(['STORE'])
    })

    it('should use custom storage types when specified', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }])
      mockSelectWhere.mockResolvedValueOnce([
        { needs: [{ MaterialTicker: 'DW', UnitsPerInterval: 42.8 }] },
      ])
      mockSelectWhere.mockResolvedValueOnce([]) // no existing

      const inserted = [
        makeLine({
          sourceStorageTypes: ['STORE', 'WAREHOUSE_STORE'],
          destinationStorageTypes: ['STORE', 'WAREHOUSE_STORE'],
        }),
      ]
      mockInsertReturning.mockResolvedValueOnce(inserted)

      const result = await controller.addConsumableLines(
        {
          sourceLocationId: 'BEN',
          destinationPlanetId: 'UV-351a',
          sourceStorageTypes: ['STORE', 'WAREHOUSE_STORE'],
          destinationStorageTypes: ['STORE', 'WAREHOUSE_STORE'],
        },
        mockRequest
      )

      expect(result.lines[0].sourceStorageTypes).toEqual(['STORE', 'WAREHOUSE_STORE'])
    })
  })

  // ==================== POST /supply-chain/add-repair ====================

  describe('addRepairLines', () => {
    it('should project repair needs forward and create lines for all materials', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }]) // planet
      // userSettingsService.getSetting for repairDays (returns 0, so max(45,0)=45)
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // source storage
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // dest storage
      // Building data from DB
      mockSelectWhere.mockResolvedValueOnce([
        {
          buildingTicker: 'CHP',
          buildingCreated: new Date('2024-01-01'),
          buildingLastRepair: new Date('2024-06-01'),
          condition: '0.95',
          repairMaterials: [{ MaterialTicker: 'BBH', MaterialAmount: 2 }],
          reclaimableMaterials: [{ MaterialTicker: 'BBH', MaterialAmount: 10 }],
        },
        {
          buildingTicker: 'FP',
          buildingCreated: new Date('2024-01-01'),
          buildingLastRepair: null,
          condition: '1.0',
          repairMaterials: [],
          reclaimableMaterials: [{ MaterialTicker: 'MCG', MaterialAmount: 20 }],
        },
      ])

      // Calculator returns projected repair needs per building
      mockCalculateBuildingRepairNeeds
        .mockReturnValueOnce([{ ticker: 'BBH', amount: 5 }])
        .mockReturnValueOnce([
          { ticker: 'MCG', amount: 8 },
          { ticker: 'INS', amount: 3 },
        ])

      mockSelectWhere.mockResolvedValueOnce([]) // no existing lines

      const inserted = [
        makeLine({ id: 1, commodityTicker: 'BBH', demandSource: 'repair' as const }),
        makeLine({ id: 2, commodityTicker: 'MCG', demandSource: 'repair' as const }),
        makeLine({ id: 3, commodityTicker: 'INS', demandSource: 'repair' as const }),
      ]
      mockInsertReturning.mockResolvedValueOnce(inserted)

      const result = await controller.addRepairLines(
        { sourceLocationId: 'BEN', destinationPlanetId: 'UV-351a' },
        mockRequest
      )

      expect(result.created).toBe(3)
      expect(result.skipped).toBe(0)
      // Verify calculator was called with 45 days projection (max(45, 0))
      expect(mockCalculateBuildingRepairNeeds).toHaveBeenCalledTimes(2)
      expect(mockCalculateBuildingRepairNeeds.mock.calls[0][1]).toBe(45)
    })

    it('should return empty when no buildings', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }]) // planet
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // source storage
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // dest storage
      mockSelectWhere.mockResolvedValueOnce([]) // no buildings

      const result = await controller.addRepairLines(
        { sourceLocationId: 'BEN', destinationPlanetId: 'UV-351a' },
        mockRequest
      )

      expect(result.created).toBe(0)
    })

    it('should skip infrastructure buildings without workforce', async () => {
      // PSL has no workforce requirement
      mockGetBuildings.mockResolvedValueOnce([
        { Ticker: 'CHP', Pioneers: 0, Settlers: 100, Technicians: 0, Engineers: 0, Scientists: 0 },
        { Ticker: 'PSL', Pioneers: 0, Settlers: 0, Technicians: 0, Engineers: 0, Scientists: 0 },
      ])

      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }]) // planet
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // source storage
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // dest storage
      mockSelectWhere.mockResolvedValueOnce([
        {
          buildingTicker: 'CHP',
          buildingCreated: new Date('2024-01-01'),
          buildingLastRepair: null,
          condition: '0.9',
          repairMaterials: [{ MaterialTicker: 'BBH', MaterialAmount: 5 }],
          reclaimableMaterials: [{ MaterialTicker: 'BBH', MaterialAmount: 10 }],
        },
        {
          buildingTicker: 'PSL',
          buildingCreated: new Date('2024-01-01'),
          buildingLastRepair: null,
          condition: '0.9',
          repairMaterials: [{ MaterialTicker: 'LSE', MaterialAmount: 5 }],
          reclaimableMaterials: [{ MaterialTicker: 'LSE', MaterialAmount: 20 }],
        },
      ])

      // Only CHP should be calculated, PSL skipped
      mockCalculateBuildingRepairNeeds.mockReturnValueOnce([{ ticker: 'BBH', amount: 5 }])

      mockSelectWhere.mockResolvedValueOnce([]) // no existing lines

      const inserted = [
        makeLine({ id: 1, commodityTicker: 'BBH', demandSource: 'repair' as const }),
      ]
      mockInsertReturning.mockResolvedValueOnce(inserted)

      const result = await controller.addRepairLines(
        { sourceLocationId: 'BEN', destinationPlanetId: 'UV-351a' },
        mockRequest
      )

      expect(result.created).toBe(1)
      // Calculator only called for CHP, not PSL
      expect(mockCalculateBuildingRepairNeeds).toHaveBeenCalledTimes(1)
    })
  })

  // ==================== POST /supply-chain/add-inputs ====================

  describe('addInputLines', () => {
    it('should create lines for production input materials from recurring orders', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }]) // planet
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // source storage
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // dest storage
      mockSelectWhere.mockResolvedValueOnce([
        {
          orders: [
            {
              Recurring: true,
              Inputs: [{ MaterialTicker: 'H2O' }, { MaterialTicker: 'GRN' }],
            },
            {
              Recurring: false, // should be skipped
              Inputs: [{ MaterialTicker: 'SKIP' }],
            },
          ],
        },
      ])
      mockSelectWhere.mockResolvedValueOnce([]) // no existing

      const inserted = [
        makeLine({ id: 1, commodityTicker: 'H2O', demandSource: 'inputs' as const }),
        makeLine({ id: 2, commodityTicker: 'GRN', demandSource: 'inputs' as const }),
      ]
      mockInsertReturning.mockResolvedValueOnce(inserted)

      const result = await controller.addInputLines(
        { sourceLocationId: 'BEN', destinationPlanetId: 'UV-351a' },
        mockRequest
      )

      expect(result.created).toBe(2)
      expect(result.skipped).toBe(0)
    })

    it('should skip non-recurring orders', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }]) // planet
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // source storage
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // dest storage
      mockSelectWhere.mockResolvedValueOnce([
        {
          orders: [{ Recurring: false, Inputs: [{ MaterialTicker: 'H2O' }] }],
        },
      ])

      const result = await controller.addInputLines(
        { sourceLocationId: 'BEN', destinationPlanetId: 'UV-351a' },
        mockRequest
      )

      expect(result.created).toBe(0)
    })

    it('should return empty when no production lines', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }]) // planet
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // source storage
      mockSelectWhere.mockResolvedValueOnce([{ type: 'STORE' }]) // dest storage
      mockSelectWhere.mockResolvedValueOnce([]) // no production

      const result = await controller.addInputLines(
        { sourceLocationId: 'BEN', destinationPlanetId: 'UV-351a' },
        mockRequest
      )

      expect(result.created).toBe(0)
    })
  })
})
