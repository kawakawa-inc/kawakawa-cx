/**
 * Validators
 *
 * Validate ParseResult for specific command types.
 * These check that the parsed result has the required fields for each use case.
 */

import type { ParseResult, OrderValidation, InvoiceValidation, QueryValidation } from './types.js'

/**
 * Validate a parse result for order commands (buy/sell).
 *
 * Requirements:
 * - At least one commodity
 * - Location (required)
 * - All commodities should have quantities (warning if missing)
 *
 * @param result - Parse result to validate
 * @returns Validation result with any errors
 */
export function validateForOrder(result: ParseResult): OrderValidation {
  const errors: string[] = []

  // Must have at least one commodity
  if (result.items.length === 0) {
    errors.push('At least one commodity is required')
  }

  // Must have a location
  if (!result.location) {
    errors.push('Location is required')
  }

  // Check for missing quantities
  const itemsWithoutQuantity = result.items.filter(item => item.quantity === null)
  if (itemsWithoutQuantity.length > 0) {
    const tickers = itemsWithoutQuantity.map(item => item.commodity.ticker).join(', ')
    errors.push(`Quantity required for: ${tickers}`)
  }

  // Check for zero or negative quantities
  const invalidQuantities = result.items.filter(
    item => item.quantity !== null && item.quantity <= 0
  )
  if (invalidQuantities.length > 0) {
    const tickers = invalidQuantities.map(item => item.commodity.ticker).join(', ')
    errors.push(`Invalid quantity for: ${tickers}`)
  }

  // Include parse errors
  errors.push(...result.errors)

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate a parse result for invoice commands.
 *
 * Requirements:
 * - At least one commodity with quantity
 * - Location (required)
 * - Counterparty user (required)
 *
 * @param result - Parse result to validate
 * @returns Validation result with any errors
 */
export function validateForInvoice(result: ParseResult): InvoiceValidation {
  const errors: string[] = []

  // Must have at least one commodity
  if (result.items.length === 0) {
    errors.push('At least one commodity is required')
  }

  // Must have a location
  if (!result.location) {
    errors.push('Location is required')
  }

  // Must have a counterparty
  if (!result.user) {
    errors.push('Counterparty user is required')
  }

  // Check for missing quantities
  const itemsWithoutQuantity = result.items.filter(item => item.quantity === null)
  if (itemsWithoutQuantity.length > 0) {
    const tickers = itemsWithoutQuantity.map(item => item.commodity.ticker).join(', ')
    errors.push(`Quantity required for: ${tickers}`)
  }

  // Check for zero or negative quantities
  const invalidQuantities = result.items.filter(
    item => item.quantity !== null && item.quantity <= 0
  )
  if (invalidQuantities.length > 0) {
    const tickers = invalidQuantities.map(item => item.commodity.ticker).join(', ')
    errors.push(`Invalid quantity for: ${tickers}`)
  }

  // Include parse errors
  errors.push(...result.errors)

  return {
    valid: errors.length === 0,
    errors,
  }
}

/**
 * Validate a parse result for query commands.
 *
 * No strict requirements - queries can filter by:
 * - Commodities (optional)
 * - Location (optional)
 * - User (optional)
 *
 * @param result - Parse result to validate
 * @returns Validation result (always valid for queries, may have warnings)
 */
export function validateForQuery(_result: ParseResult): QueryValidation {
  const errors: string[] = []

  // Include parse errors as warnings (don't fail validation)
  // Queries are lenient - we extract what we can

  return {
    valid: true,
    errors,
  }
}

/**
 * Check if a parse result has any content to work with.
 */
export function hasContent(result: ParseResult): boolean {
  return (
    result.items.length > 0 ||
    result.location !== null ||
    result.user !== null ||
    result.xit !== null
  )
}

/**
 * Get a summary of what was parsed for error messages.
 */
export function summarizeParsed(result: ParseResult): string {
  const parts: string[] = []

  if (result.items.length > 0) {
    const tickers = result.items.map(item => item.commodity.ticker).join(', ')
    parts.push(`commodities: ${tickers}`)
  }

  if (result.location) {
    parts.push(`location: ${result.location.name}`)
  }

  if (result.user) {
    parts.push(`user: ${result.user.username}`)
  }

  if (result.limit) {
    parts.push(`limit: ${result.limit.mode} ${result.limit.quantity}`)
  }

  if (result.actions.size > 0) {
    parts.push(`actions: ${Array.from(result.actions).join(', ')}`)
  }

  return parts.length > 0 ? parts.join(', ') : 'nothing parsed'
}
