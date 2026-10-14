/**
 * XIT Paste serializer
 *
 * Writes the `TICKER\tQUANTITY\tPRICE` text accepted by refined-prun's XIT ACT
 * Paste material group. Output is gated through the vendored upstream parser:
 * a result only carries `text` when `parseMaterials` reads it back to exactly
 * the bill we meant to write, so the parser stays the single source of truth.
 */

import {
  maxPriceSignificantFigures,
  parseMaterials,
  parsePaste,
  type MaterialBill,
} from './paste-parse.js'

export type PasteRounding = 'none' | 'up' | 'down'

export interface PasteMaterial {
  ticker: string
  quantity: number
  price: number
}

export interface PasteSerializeError {
  ticker: string
  reason: string
}

export interface PasteAdjustment {
  ticker: string
  from: number
  to: number
}

export interface PasteSerializeResult {
  /** Undefined whenever `errors` is non-empty. */
  text?: string
  errors: PasteSerializeError[]
  /** Aggregated materials, with the price that was written. */
  materials: PasteMaterial[]
  /** Prices changed by rounding. Always empty for 'none'. */
  adjustments: PasteAdjustment[]
  /** Contract total as PRUN computes it: Σ floor(quantity × price). */
  gameTotal: number
  /** `gameTotal` minus the exact total of the input prices. */
  totalDelta: number
}

/** CONT limits from refined-prun `actions/cont-limits.ts`. */
export const minContractPrice = 0.01
export const maxContractPrice = 100000000

// The parser rejects prices beyond these; see refined-prun#247.
const maxDecimalPlaces = 2

interface Decimal {
  digits: bigint
  scale: number
}

function toDecimal(value: number): Decimal | undefined {
  // Shortest round-trip form, so 4.35 is "4.35" and not 4.3499999...
  const match = /^(\d+)(?:\.(\d+))?$/.exec(String(value))
  if (!match) return undefined
  const frac = match[2] ?? ''
  return { digits: BigInt(match[1] + frac), scale: frac.length }
}

function fromDecimal({ digits, scale }: Decimal): number {
  return Number(`${digits}e-${scale}`)
}

/**
 * Round a price to the nearest value the XIT Paste parser accepts, in the
 * given direction: at most 3 significant figures and at most 2 decimal places.
 * Prices that already qualify are returned unchanged.
 */
export function roundPrice(price: number, mode: 'up' | 'down'): number {
  const decimal = toDecimal(price)
  if (decimal === undefined || decimal.digits === 0n) return price

  const { digits, scale } = decimal
  const mostSignificantExponent = digits.toString().length - 1 - scale
  const keepExponent = Math.max(
    mostSignificantExponent - (maxPriceSignificantFigures - 1),
    -maxDecimalPlaces
  )
  const drop = keepExponent + scale
  if (drop <= 0) return price

  const step = 10n ** BigInt(drop)
  const remainder = digits % step
  if (remainder === 0n) return price
  const floored = digits - remainder
  return fromDecimal({ digits: mode === 'down' ? floored : floored + step, scale })
}

function formatPrice(price: number): string {
  // Minimal representation: 530, not 530.00. Prices are bounded to the CONT
  // range before this runs, so String never produces exponent notation.
  return String(price)
}

function toCents(price: number): bigint {
  return BigInt(Math.round(price * 100))
}

const resolveTicker = (ticker: string): string | undefined =>
  ticker.length > 0 ? ticker : undefined

function emptyResult(errors: PasteSerializeError[]): PasteSerializeResult {
  return { errors, materials: [], adjustments: [], gameTotal: 0, totalDelta: 0 }
}

export function serializePaste(
  input: PasteMaterial[],
  rounding: PasteRounding = 'none'
): PasteSerializeResult {
  const errors: PasteSerializeError[] = []
  const aggregated = new Map<string, PasteMaterial>()

  for (const { ticker, quantity, price } of input) {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      errors.push({ ticker, reason: `quantity ${quantity} is not a positive whole number` })
      continue
    }
    const existing = aggregated.get(ticker)
    if (existing === undefined) {
      aggregated.set(ticker, { ticker, quantity, price })
      continue
    }
    // Checked before rounding: merging two real prices would hide a discrepancy.
    if (existing.price !== price) {
      errors.push({
        ticker,
        reason: `conflicting prices ${formatPrice(existing.price)} and ${formatPrice(price)}`,
      })
      continue
    }
    existing.quantity += quantity
    if (!Number.isSafeInteger(existing.quantity)) {
      errors.push({ ticker, reason: 'total quantity is too large' })
    }
  }

  const materials: PasteMaterial[] = []
  const adjustments: PasteAdjustment[] = []
  for (const material of aggregated.values()) {
    const { ticker, price } = material
    if (!Number.isFinite(price)) {
      errors.push({ ticker, reason: `price ${price} is not a number` })
      continue
    }
    const written = rounding === 'none' ? price : roundPrice(price, rounding)
    if (written < minContractPrice || written > maxContractPrice) {
      errors.push({
        ticker,
        reason: `price ${formatPrice(written)} is outside the contract range ${minContractPrice} to ${maxContractPrice}`,
      })
      continue
    }
    if (written !== price) {
      adjustments.push({ ticker, from: price, to: written })
    }
    materials.push({ ...material, price: written })
  }

  if (errors.length > 0) return emptyResult(errors)
  if (materials.length === 0) return emptyResult([{ ticker: '', reason: 'no materials to copy' }])

  const text = materials.map(x => `${x.ticker}\t${x.quantity}\t${formatPrice(x.price)}`).join('\n')

  const expected: MaterialBill = {}
  for (const x of materials) expected[x.ticker] = { quantity: x.quantity, price: x.price }

  const bill = parseMaterials(text, resolveTicker)
  if (bill === undefined) {
    const parsed = parsePaste(text, resolveTicker)
    const gateErrors = parsed.errors.map(x => ({
      ticker: materials[x.line - 1]?.ticker ?? '',
      reason: x.reason,
    }))
    if (parsed.fatal !== undefined) gateErrors.push({ ticker: '', reason: parsed.fatal })
    if (gateErrors.length === 0) gateErrors.push({ ticker: '', reason: 'XIT rejected the paste' })
    return emptyResult(gateErrors)
  }
  if (!billsEqual(bill, expected)) {
    return emptyResult([{ ticker: '', reason: 'XIT read the paste back differently' }])
  }

  let exactCents = 0n
  for (const x of aggregated.values()) exactCents += BigInt(x.quantity) * toCents(x.price)
  let gameUnits = 0n
  for (const x of materials) gameUnits += (BigInt(x.quantity) * toCents(x.price)) / 100n
  const gameCents = gameUnits * 100n

  return {
    text,
    errors: [],
    materials,
    adjustments,
    gameTotal: Number(gameUnits),
    totalDelta: Number(gameCents - exactCents) / 100,
  }
}

function billsEqual(a: MaterialBill, b: MaterialBill): boolean {
  const keys = Object.keys(a)
  if (keys.length !== Object.keys(b).length) return false
  return keys.every(
    k => b[k] !== undefined && a[k].quantity === b[k].quantity && a[k].price === b[k].price
  )
}
