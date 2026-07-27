import { describe, it, expect, vi, beforeEach } from 'vitest'
import { syncUserCxos, CX_SELL_ORDER_STORAGE_TYPE } from './sync-user-cxos.js'
import type { FioCxOrder } from './types.js'

// Create mock functions at module scope
const mockGetUserCxos = vi.fn()

// Mock the FIO client module
vi.mock('./client.js', () => ({
  FioClient: class MockFioClient {
    getUserCxos = mockGetUserCxos
  },
}))

// Mock the database module
const mockSelectFrom = vi.fn()
const mockDeleteWhere = vi.fn()
const mockInsertValues = vi.fn()
const mockInsertReturning = vi.fn()

vi.mock('@kawakawa/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: mockSelectFrom,
    })),
    insert: vi.fn(() => ({
      values: mockInsertValues.mockReturnValue({
        returning: mockInsertReturning,
      }),
    })),
    delete: vi.fn(() => ({
      where: mockDeleteWhere,
    })),
  },
  fioInventory: {
    id: 'id',
    userStorageId: 'userStorageId',
    commodityTicker: 'commodityTicker',
    quantity: 'quantity',
  },
  fioUserStorage: {
    id: 'id',
    userId: 'userId',
    storageId: 'storageId',
    locationId: 'locationId',
    type: 'type',
    fioUploadedAt: 'fioUploadedAt',
    lastSyncedAt: 'lastSyncedAt',
  },
  fioLocations: {
    naturalId: 'naturalId',
  },
  fioCommodities: {
    ticker: 'ticker',
  },
}))

describe('syncUserCxos', () => {
  const userId = 1
  const fioApiKey = 'test-api-key'
  const fioUsername = 'TestUser'

  beforeEach(() => {
    vi.clearAllMocks()
    mockSelectFrom.mockReset()
    mockDeleteWhere.mockReset()
    mockInsertValues.mockReset()
    mockInsertReturning.mockReset()
    mockGetUserCxos.mockReset()

    mockDeleteWhere.mockResolvedValue(undefined)
    mockInsertValues.mockReturnValue({ returning: mockInsertReturning })
  })

  it('should sync CX sell orders successfully', async () => {
    // Mock existing locations (BEN = CI1 station)
    mockSelectFrom
      .mockResolvedValueOnce([{ naturalId: 'BEN' }, { naturalId: 'MOR' }])
      .mockResolvedValueOnce([{ ticker: 'H2O' }, { ticker: 'RAT' }, { ticker: 'COF' }])

    // Mock CXOS response with sell orders
    const cxosResponse: FioCxOrder[] = [
      {
        CXOSTradeOrderId: 'order-1',
        BrokerId: 'broker-1',
        ExchangeName: 'Benten Exchange',
        ExchangeCode: 'CI1',
        OrderType: 'SELLING',
        MaterialId: 'mat-h2o',
        MaterialName: 'Water',
        MaterialTicker: 'H2O',
        Amount: 100,
        InitialAmount: 200,
        Limit: 50,
        LimitCurrency: 'CIS',
        Status: 'PARTIALLY_FILLED',
        CreatedEpochMs: Date.now(),
        UserNameSubmitted: 'TestUser',
        Timestamp: new Date().toISOString(),
      },
      {
        CXOSTradeOrderId: 'order-2',
        BrokerId: 'broker-1',
        ExchangeName: 'Benten Exchange',
        ExchangeCode: 'CI1',
        OrderType: 'SELLING',
        MaterialId: 'mat-rat',
        MaterialName: 'Rations',
        MaterialTicker: 'RAT',
        Amount: 50,
        InitialAmount: 100,
        Limit: 100,
        LimitCurrency: 'CIS',
        Status: 'PLACED',
        CreatedEpochMs: Date.now(),
        UserNameSubmitted: 'TestUser',
        Timestamp: new Date().toISOString(),
      },
    ]

    mockGetUserCxos.mockResolvedValue(cxosResponse)
    mockInsertReturning.mockResolvedValue([{ id: 1 }])

    const result = await syncUserCxos(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.sellOrdersProcessed).toBe(2)
    expect(result.buyOrdersSkipped).toBe(0)
    expect(result.storageLocationsCreated).toBe(1) // One storage for BEN
    expect(result.inserted).toBe(2) // H2O and RAT inventory items
    expect(result.errors).toHaveLength(0)
  })

  it('should skip buy orders', async () => {
    mockSelectFrom
      .mockResolvedValueOnce([{ naturalId: 'BEN' }])
      .mockResolvedValueOnce([{ ticker: 'H2O' }])

    const cxosResponse: FioCxOrder[] = [
      {
        CXOSTradeOrderId: 'order-1',
        BrokerId: 'broker-1',
        ExchangeName: 'Benten Exchange',
        ExchangeCode: 'CI1',
        OrderType: 'BUYING', // Buy order - should be skipped
        MaterialId: 'mat-h2o',
        MaterialName: 'Water',
        MaterialTicker: 'H2O',
        Amount: 100,
        InitialAmount: 200,
        Limit: 50,
        LimitCurrency: 'CIS',
        Status: 'PLACED',
        CreatedEpochMs: Date.now(),
        UserNameSubmitted: 'TestUser',
        Timestamp: new Date().toISOString(),
      },
    ]

    mockGetUserCxos.mockResolvedValue(cxosResponse)

    const result = await syncUserCxos(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.sellOrdersProcessed).toBe(0)
    expect(result.buyOrdersSkipped).toBe(1)
    expect(result.storageLocationsCreated).toBe(0)
    expect(result.inserted).toBe(0)
  })

  it('should aggregate multiple sell orders for the same commodity', async () => {
    mockSelectFrom
      .mockResolvedValueOnce([{ naturalId: 'BEN' }])
      .mockResolvedValueOnce([{ ticker: 'H2O' }])

    // Two sell orders for H2O at CI1
    const cxosResponse: FioCxOrder[] = [
      {
        CXOSTradeOrderId: 'order-1',
        BrokerId: 'broker-1',
        ExchangeName: 'Benten Exchange',
        ExchangeCode: 'CI1',
        OrderType: 'SELLING',
        MaterialId: 'mat-h2o',
        MaterialName: 'Water',
        MaterialTicker: 'H2O',
        Amount: 100,
        InitialAmount: 200,
        Limit: 50,
        LimitCurrency: 'CIS',
        Status: 'PARTIALLY_FILLED',
        CreatedEpochMs: Date.now(),
        UserNameSubmitted: 'TestUser',
        Timestamp: new Date().toISOString(),
      },
      {
        CXOSTradeOrderId: 'order-2',
        BrokerId: 'broker-1',
        ExchangeName: 'Benten Exchange',
        ExchangeCode: 'CI1',
        OrderType: 'SELLING',
        MaterialId: 'mat-h2o',
        MaterialName: 'Water',
        MaterialTicker: 'H2O',
        Amount: 50,
        InitialAmount: 100,
        Limit: 60,
        LimitCurrency: 'CIS',
        Status: 'PLACED',
        CreatedEpochMs: Date.now(),
        UserNameSubmitted: 'TestUser',
        Timestamp: new Date().toISOString(),
      },
    ]

    mockGetUserCxos.mockResolvedValue(cxosResponse)
    mockInsertReturning.mockResolvedValue([{ id: 1 }])

    const result = await syncUserCxos(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.sellOrdersProcessed).toBe(2) // Both orders processed
    expect(result.inserted).toBe(1) // Aggregated into one inventory item (100 + 50 = 150)
    expect(result.storageLocationsCreated).toBe(1)
  })

  it('should handle multiple exchanges', async () => {
    mockSelectFrom
      .mockResolvedValueOnce([{ naturalId: 'BEN' }, { naturalId: 'MOR' }])
      .mockResolvedValueOnce([{ ticker: 'H2O' }])

    const cxosResponse: FioCxOrder[] = [
      {
        CXOSTradeOrderId: 'order-1',
        BrokerId: 'broker-1',
        ExchangeName: 'Benten Exchange',
        ExchangeCode: 'CI1', // BEN
        OrderType: 'SELLING',
        MaterialId: 'mat-h2o',
        MaterialName: 'Water',
        MaterialTicker: 'H2O',
        Amount: 100,
        InitialAmount: 200,
        Limit: 50,
        LimitCurrency: 'CIS',
        Status: 'PARTIALLY_FILLED',
        CreatedEpochMs: Date.now(),
        UserNameSubmitted: 'TestUser',
        Timestamp: new Date().toISOString(),
      },
      {
        CXOSTradeOrderId: 'order-2',
        BrokerId: 'broker-1',
        ExchangeName: 'Moria Exchange',
        ExchangeCode: 'NC1', // MOR
        OrderType: 'SELLING',
        MaterialId: 'mat-h2o',
        MaterialName: 'Water',
        MaterialTicker: 'H2O',
        Amount: 75,
        InitialAmount: 150,
        Limit: 45,
        LimitCurrency: 'NCC',
        Status: 'PLACED',
        CreatedEpochMs: Date.now(),
        UserNameSubmitted: 'TestUser',
        Timestamp: new Date().toISOString(),
      },
    ]

    mockGetUserCxos.mockResolvedValue(cxosResponse)
    mockInsertReturning
      .mockResolvedValueOnce([{ id: 1 }]) // BEN storage
      .mockResolvedValueOnce([{ id: 2 }]) // MOR storage

    const result = await syncUserCxos(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.sellOrdersProcessed).toBe(2)
    expect(result.storageLocationsCreated).toBe(2) // One for BEN, one for MOR
    expect(result.inserted).toBe(2) // One H2O item per station
  })

  it('should skip unknown exchange codes', async () => {
    mockSelectFrom
      .mockResolvedValueOnce([{ naturalId: 'BEN' }])
      .mockResolvedValueOnce([{ ticker: 'H2O' }])

    const cxosResponse: FioCxOrder[] = [
      {
        CXOSTradeOrderId: 'order-1',
        BrokerId: 'broker-1',
        ExchangeName: 'Unknown Exchange',
        ExchangeCode: 'XX1', // Unknown exchange
        OrderType: 'SELLING',
        MaterialId: 'mat-h2o',
        MaterialName: 'Water',
        MaterialTicker: 'H2O',
        Amount: 100,
        InitialAmount: 200,
        Limit: 50,
        LimitCurrency: 'CIS',
        Status: 'PLACED',
        CreatedEpochMs: Date.now(),
        UserNameSubmitted: 'TestUser',
        Timestamp: new Date().toISOString(),
      },
    ]

    mockGetUserCxos.mockResolvedValue(cxosResponse)

    const result = await syncUserCxos(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.skippedUnknownExchanges).toBe(1)
    expect(result.sellOrdersProcessed).toBe(0)
  })

  it('should skip unknown commodities', async () => {
    mockSelectFrom
      .mockResolvedValueOnce([{ naturalId: 'BEN' }])
      .mockResolvedValueOnce([{ ticker: 'H2O' }]) // Only H2O is known

    const cxosResponse: FioCxOrder[] = [
      {
        CXOSTradeOrderId: 'order-1',
        BrokerId: 'broker-1',
        ExchangeName: 'Benten Exchange',
        ExchangeCode: 'CI1',
        OrderType: 'SELLING',
        MaterialId: 'mat-xyz',
        MaterialName: 'Unknown Material',
        MaterialTicker: 'XYZ', // Unknown commodity
        Amount: 100,
        InitialAmount: 200,
        Limit: 50,
        LimitCurrency: 'CIS',
        Status: 'PLACED',
        CreatedEpochMs: Date.now(),
        UserNameSubmitted: 'TestUser',
        Timestamp: new Date().toISOString(),
      },
    ]

    mockGetUserCxos.mockResolvedValue(cxosResponse)
    mockInsertReturning.mockResolvedValue([{ id: 1 }])

    const result = await syncUserCxos(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.skippedUnknownCommodities).toBe(1)
  })

  it('should handle empty CXOS response', async () => {
    mockGetUserCxos.mockResolvedValue([])

    const result = await syncUserCxos(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.sellOrdersProcessed).toBe(0)
    expect(result.buyOrdersSkipped).toBe(0)
    expect(result.inserted).toBe(0)
  })

  it('should handle null CXOS response', async () => {
    mockGetUserCxos.mockResolvedValue(null)

    const result = await syncUserCxos(userId, fioApiKey, fioUsername)

    expect(result.success).toBe(true)
    expect(result.sellOrdersProcessed).toBe(0)
  })

  it('should return correct storage type constant', () => {
    expect(CX_SELL_ORDER_STORAGE_TYPE).toBe('CX_SELL_ORDER')
  })
})
