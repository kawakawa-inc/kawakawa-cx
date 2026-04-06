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
  fioPlanetBuildings: { userPlanetId: 'userPlanetId', repairMaterials: 'repairMaterials' },
  fioPlanetProduction: { userPlanetId: 'userPlanetId', orders: 'orders' },
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
      ).rejects.toThrow('Demand lines require either demandSource or a fixed demand amount')
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
      mockSelectWhere.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }])

      const result = await controller.clearLines('BEN', 'UV-351a', mockRequest)

      expect(result.deleted).toBe(3)
    })

    it('should return 0 when no lines to delete', async () => {
      mockSelectWhere.mockResolvedValueOnce([])

      const result = await controller.clearLines('BEN', 'UNKNOWN', mockRequest)

      expect(result.deleted).toBe(0)
    })
  })

  // ==================== POST /supply-chain/add-consumables ====================

  describe('addConsumableLines', () => {
    it('should create lines for each workforce consumable material', async () => {
      // Planet lookup
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }])
      // Workforce data
      mockSelectWhere.mockResolvedValueOnce([
        {
          needs: [
            { MaterialTicker: 'DW' },
            { MaterialTicker: 'RAT' },
            { MaterialTicker: 'DW' }, // duplicate should be deduped
          ],
        },
        {
          needs: [{ MaterialTicker: 'COF' }],
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
      mockSelectWhere.mockResolvedValueOnce([
        { needs: [{ MaterialTicker: 'DW' }, { MaterialTicker: 'RAT' }] },
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

    it('should use default storage types when not specified', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }])
      mockSelectWhere.mockResolvedValueOnce([{ needs: [{ MaterialTicker: 'DW' }] }])
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
      mockSelectWhere.mockResolvedValueOnce([{ needs: [{ MaterialTicker: 'DW' }] }])
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
    it('should create lines for each repair material', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }]) // planet
      mockSelectWhere.mockResolvedValueOnce([
        { repairMaterials: [{ MaterialTicker: 'BBH' }, { MaterialTicker: 'INS' }] },
        { repairMaterials: [{ MaterialTicker: 'BBH' }] }, // duplicate deduped
      ])
      mockSelectWhere.mockResolvedValueOnce([]) // no existing

      const inserted = [
        makeLine({ id: 1, commodityTicker: 'BBH', demandSource: 'repair' as const }),
        makeLine({ id: 2, commodityTicker: 'INS', demandSource: 'repair' as const }),
      ]
      mockInsertReturning.mockResolvedValueOnce(inserted)

      const result = await controller.addRepairLines(
        { sourceLocationId: 'BEN', destinationPlanetId: 'UV-351a' },
        mockRequest
      )

      expect(result.created).toBe(2)
      expect(result.skipped).toBe(0)
    })

    it('should return empty when no buildings', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }])
      mockSelectWhere.mockResolvedValueOnce([]) // no buildings

      const result = await controller.addRepairLines(
        { sourceLocationId: 'BEN', destinationPlanetId: 'UV-351a' },
        mockRequest
      )

      expect(result.created).toBe(0)
    })
  })

  // ==================== POST /supply-chain/add-inputs ====================

  describe('addInputLines', () => {
    it('should create lines for production input materials from recurring orders', async () => {
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }]) // planet
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
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }])
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
      mockSelectWhere.mockResolvedValueOnce([{ id: 10 }])
      mockSelectWhere.mockResolvedValueOnce([]) // no production

      const result = await controller.addInputLines(
        { sourceLocationId: 'BEN', destinationPlanetId: 'UV-351a' },
        mockRequest
      )

      expect(result.created).toBe(0)
    })
  })
})
