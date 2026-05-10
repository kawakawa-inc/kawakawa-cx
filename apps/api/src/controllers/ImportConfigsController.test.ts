import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ImportConfigsController } from './ImportConfigsController.js'

// Mock result holders
let mockImportConfigsResult: unknown[] = []
let mockPriceListsResult: unknown[] = []
let mockLocationsResult: unknown[] = []
let mockCommoditiesResult: unknown[] = []
let mockPricesResult: unknown[] = []
let mockInsertedId = 1

// Track insert/update calls
let insertCalls: unknown[] = []
let updateCalls: unknown[] = []

vi.mock('../db/index.js', () => {
  const importConfigsTable = { __table: 'importConfigs' }
  const priceListsTable = { __table: 'priceLists' }
  const fioLocationsTable = { __table: 'fioLocations' }
  const fioCommoditiesTable = { __table: 'fioCommodities' }
  const pricesTable = { __table: 'prices' }

  return {
    db: {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation((table: { __table: string }) => {
          const tableName = table?.__table || ''

          if (tableName === 'importConfigs') {
            return {
              where: vi.fn().mockImplementation(() => ({
                limit: vi.fn().mockImplementation(() => Promise.resolve(mockImportConfigsResult)),
              })),
              orderBy: vi.fn().mockImplementation(() => Promise.resolve(mockImportConfigsResult)),
            }
          }
          if (tableName === 'priceLists') {
            return {
              where: vi.fn().mockImplementation(() => ({
                limit: vi.fn().mockImplementation(() => Promise.resolve(mockPriceListsResult)),
              })),
            }
          }
          if (tableName === 'fioLocations') {
            return Promise.resolve(mockLocationsResult)
          }
          if (tableName === 'fioCommodities') {
            return Promise.resolve(mockCommoditiesResult)
          }
          if (tableName === 'prices') {
            return {
              where: vi.fn().mockImplementation(() => ({
                limit: vi.fn().mockImplementation(() => Promise.resolve(mockPricesResult)),
              })),
            }
          }
          return {
            where: vi.fn().mockResolvedValue([]),
            orderBy: vi.fn().mockResolvedValue([]),
          }
        }),
      })),
      insert: vi.fn().mockImplementation(() => ({
        values: vi.fn().mockImplementation((data: unknown) => {
          insertCalls.push(data)
          return {
            returning: vi
              .fn()
              .mockImplementation(() => Promise.resolve([{ id: mockInsertedId++ }])),
          }
        }),
      })),
      update: vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation((data: unknown) => {
          updateCalls.push(data)
          return {
            where: vi.fn().mockResolvedValue(undefined),
          }
        }),
      })),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    },
    importConfigs: importConfigsTable,
    priceLists: priceListsTable,
    fioLocations: fioLocationsTable,
    fioCommodities: fioCommoditiesTable,
    prices: pricesTable,
  }
})

// Mock Google Sheets client
let mockSheetContent = ''
vi.mock('../services/google-sheets/client.js', () => ({
  parseGoogleSheetsUrl: vi.fn().mockImplementation((url: string) => {
    if (url.includes('invalid')) return null
    return { spreadsheetId: 'test-id', sheetGid: 0 }
  }),
  fetchSheetAsCsv: vi.fn().mockImplementation(() => {
    if (mockSheetContent === 'ERROR') {
      return Promise.resolve({ success: false, error: 'Failed to fetch' })
    }
    return Promise.resolve({ success: true, content: mockSheetContent })
  }),
  fetchSheetByUrl: vi.fn().mockImplementation(() => {
    return Promise.resolve({ success: true, content: mockSheetContent })
  }),
}))

describe('ImportConfigsController', () => {
  let controller: ImportConfigsController

  beforeEach(() => {
    controller = new ImportConfigsController()
    controller.setStatus = vi.fn()
    vi.clearAllMocks()

    // Reset mocks
    mockImportConfigsResult = []
    mockPriceListsResult = []
    mockLocationsResult = []
    mockCommoditiesResult = []
    mockPricesResult = []
    mockSheetContent = ''
    mockInsertedId = 1
    insertCalls = []
    updateCalls = []
  })

  describe('getConfigs', () => {
    it('should return all import configurations', async () => {
      mockImportConfigsResult = [
        {
          id: 1,
          priceListCode: 'TEST',
          name: 'Test Price Sheet',
          sourceType: 'google_sheets',
          format: 'flat',
          sheetsUrl: 'https://docs.google.com/spreadsheets/d/test',
          sheetGid: null,
          config: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const result = await controller.getConfigs()

      expect(result).toHaveLength(1)
      expect(result[0].name).toBe('Test Price Sheet')
      expect(result[0].format).toBe('flat')
    })

    it('should return empty array when no configs', async () => {
      const result = await controller.getConfigs()
      expect(result).toHaveLength(0)
    })
  })
})
