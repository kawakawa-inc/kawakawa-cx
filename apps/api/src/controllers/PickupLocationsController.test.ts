import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PickupLocationsController } from './PickupLocationsController.js'

let mockPickupLocationsResult: unknown[] = []
let mockLocationsResult: unknown[] = []

vi.mock('../db/index.js', () => {
  const pickupLocationsTable = { __table: 'pickupLocations', locationId: 'locationId' }
  const fioLocationsTable = { __table: 'fioLocations', naturalId: 'naturalId' }

  return {
    db: {
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation((table: { __table: string }) => {
          const tableName = table?.__table || ''
          if (tableName === 'pickupLocations') {
            return {
              innerJoin: vi.fn().mockImplementation(() => ({
                orderBy: vi
                  .fn()
                  .mockImplementation(() => Promise.resolve(mockPickupLocationsResult)),
              })),
              where: vi.fn().mockImplementation(() => ({
                limit: vi.fn().mockImplementation(() => Promise.resolve(mockPickupLocationsResult)),
              })),
            }
          }
          if (tableName === 'fioLocations') {
            return {
              where: vi.fn().mockImplementation(() => ({
                limit: vi.fn().mockImplementation(() => Promise.resolve(mockLocationsResult)),
              })),
            }
          }
          return { where: vi.fn().mockResolvedValue([]) }
        }),
      })),
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoUpdate: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(() => Promise.resolve(mockPickupLocationsResult)),
          }),
        }),
      }),
      update: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockImplementation(() => Promise.resolve(mockPickupLocationsResult)),
          }),
        }),
      }),
      delete: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    },
    pickupLocations: pickupLocationsTable,
    fioLocations: fioLocationsTable,
  }
})

describe('PickupLocationsController', () => {
  let controller: PickupLocationsController

  beforeEach(() => {
    controller = new PickupLocationsController()
    vi.clearAllMocks()
    mockPickupLocationsResult = []
    mockLocationsResult = []
  })

  describe('listPickupLocations', () => {
    it('returns fee rows joined with location name', async () => {
      mockPickupLocationsResult = [
        {
          locationId: 'PRX',
          extraFee: '5000.00',
          currency: 'CIS',
          description: 'Extra shipping',
          createdAt: new Date(),
          updatedAt: new Date(),
          locationName: 'Proxion',
        },
      ]

      const result = await controller.listPickupLocations()

      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({
        locationId: 'PRX',
        locationName: 'Proxion',
        extraFee: 5000,
        currency: 'CIS',
      })
    })

    it('returns an empty array when no fees are configured', async () => {
      const result = await controller.listPickupLocations()
      expect(result).toEqual([])
    })
  })

  describe('createPickupLocation', () => {
    it('throws when locationId is missing', async () => {
      await expect(
        controller.createPickupLocation({ locationId: '', extraFee: 100, currency: 'CIS' })
      ).rejects.toThrow('locationId is required')
    })

    it('throws when extraFee is negative', async () => {
      mockLocationsResult = [{ naturalId: 'PRX', name: 'Proxion' }]
      await expect(
        controller.createPickupLocation({ locationId: 'PRX', extraFee: -1, currency: 'CIS' })
      ).rejects.toThrow('extraFee must be a non-negative number')
    })

    it('throws when the location does not exist', async () => {
      mockLocationsResult = []
      await expect(
        controller.createPickupLocation({ locationId: 'NOPE', extraFee: 100, currency: 'CIS' })
      ).rejects.toThrow('Unknown location: NOPE')
    })

    it('creates (upserts) a pickup fee for a known location', async () => {
      mockLocationsResult = [{ naturalId: 'PRX', name: 'Proxion' }]
      mockPickupLocationsResult = [
        {
          locationId: 'PRX',
          extraFee: '5000.00',
          currency: 'CIS',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const result = await controller.createPickupLocation({
        locationId: 'PRX',
        extraFee: 5000,
        currency: 'CIS',
      })

      expect(result.locationId).toBe('PRX')
      expect(result.locationName).toBe('Proxion')
      expect(result.extraFee).toBe(5000)
    })

    it('does not change the case of a locationId (planet IDs have meaningful lowercase suffixes)', async () => {
      mockLocationsResult = [{ naturalId: 'UV-351a', name: 'Katoa' }]
      mockPickupLocationsResult = [
        {
          locationId: 'UV-351a',
          extraFee: '2000.00',
          currency: 'CIS',
          description: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]

      const result = await controller.createPickupLocation({
        locationId: '  UV-351a  ',
        extraFee: 2000,
        currency: 'CIS',
      })

      expect(result.locationId).toBe('UV-351a')
    })
  })

  describe('updatePickupLocation', () => {
    it('throws NotFound when no fee exists for the location', async () => {
      mockPickupLocationsResult = []
      await expect(controller.updatePickupLocation('PRX', { extraFee: 100 })).rejects.toThrow()
    })

    it('throws when extraFee is negative', async () => {
      mockPickupLocationsResult = [
        { locationId: 'PRX', extraFee: '5000.00', currency: 'CIS', description: null },
      ]
      await expect(controller.updatePickupLocation('PRX', { extraFee: -5 })).rejects.toThrow(
        'extraFee must be a non-negative number'
      )
    })
  })

  describe('deletePickupLocation', () => {
    it('throws NotFound when no fee exists for the location', async () => {
      mockPickupLocationsResult = []
      await expect(controller.deletePickupLocation('PRX')).rejects.toThrow()
    })

    it('deletes an existing fee', async () => {
      mockPickupLocationsResult = [{ locationId: 'PRX' }]
      controller.setStatus = vi.fn()

      await controller.deletePickupLocation('PRX')

      expect(controller.setStatus).toHaveBeenCalledWith(204)
    })
  })
})
