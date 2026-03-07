/**
 * Modal builder utilities for Discord bot commands
 */
import { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } from 'discord.js'

/**
 * Options for creating a quantity + notes modal
 */
export interface QuantityNotesModalOptions {
  /** Custom ID for the modal */
  modalId: string
  /** Modal title */
  title: string
  /** Maximum allowed quantity */
  maxQuantity: number
  /** Custom label for quantity field (default: "Quantity (max {maxQuantity})") */
  quantityLabel?: string
  /** Placeholder text for notes field */
  notesPlaceholder?: string
}

/**
 * Create a modal with quantity and optional notes inputs.
 * Commonly used for reserve/fill operations.
 *
 * @param options - Modal configuration options
 * @returns Configured ModalBuilder
 *
 * @example
 * ```typescript
 * const modal = createQuantityNotesModal({
 *   modalId: `reserve-modal:${Date.now()}`,
 *   title: 'Reserve COF',
 *   maxQuantity: 100,
 *   notesPlaceholder: 'Any message for the seller',
 * })
 * await interaction.showModal(modal)
 * ```
 */
export function createQuantityNotesModal(options: QuantityNotesModalOptions): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(options.modalId).setTitle(options.title)

  const quantityInput = new TextInputBuilder()
    .setCustomId('quantity')
    .setLabel(options.quantityLabel ?? `Quantity (max ${options.maxQuantity})`)
    .setPlaceholder(options.maxQuantity.toString())
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10)

  const notesInput = new TextInputBuilder()
    .setCustomId('notes')
    .setLabel('Notes (optional)')
    .setPlaceholder(options.notesPlaceholder ?? 'Any additional notes')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(false)
    .setMaxLength(500)

  return modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(notesInput)
  )
}

/**
 * Options for creating a single text input modal
 */
export interface SingleInputModalOptions {
  /** Custom ID for the modal */
  modalId: string
  /** Modal title */
  title: string
  /** Input field custom ID */
  inputId: string
  /** Input field label */
  label: string
  /** Placeholder text */
  placeholder?: string
  /** Input style (Short or Paragraph) */
  style?: TextInputStyle
  /** Whether the field is required */
  required?: boolean
  /** Maximum length */
  maxLength?: number
  /** Minimum length */
  minLength?: number
  /** Default value */
  value?: string
}

/**
 * Create a modal with a single text input.
 *
 * @param options - Modal configuration options
 * @returns Configured ModalBuilder
 */
export function createSingleInputModal(options: SingleInputModalOptions): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(options.modalId).setTitle(options.title)

  const input = new TextInputBuilder()
    .setCustomId(options.inputId)
    .setLabel(options.label)
    .setStyle(options.style ?? TextInputStyle.Short)
    .setRequired(options.required ?? true)

  if (options.placeholder) {
    input.setPlaceholder(options.placeholder)
  }
  if (options.maxLength) {
    input.setMaxLength(options.maxLength)
  }
  if (options.minLength) {
    input.setMinLength(options.minLength)
  }
  if (options.value) {
    input.setValue(options.value)
  }

  return modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input))
}

/**
 * Options for creating an order edit modal
 */
export interface OrderEditModalOptions {
  /** Custom ID for the modal */
  modalId: string
  /** Modal title */
  title: string
  /** Direction of the order */
  direction: 'buy' | 'sell'
  /** Pre-filled quantity (as string for display) */
  quantity?: string
  /** Pre-filled price (as string for display) */
  price?: string
  /** Pre-filled limit quantity for sell orders */
  limitQuantity?: string
}

/**
 * Create a modal for editing order details.
 * For buy orders: quantity (required) and price (optional)
 * For sell orders: limit quantity (optional) and price (optional)
 *
 * @param options - Modal configuration options
 * @returns Configured ModalBuilder
 */
export function createOrderEditModal(options: OrderEditModalOptions): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(options.modalId).setTitle(options.title)

  if (options.direction === 'buy') {
    // Buy: Quantity (required) + Price (optional)
    const quantityInput = new TextInputBuilder()
      .setCustomId('quantity')
      .setLabel('Quantity')
      .setPlaceholder('e.g., 500')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(10)

    if (options.quantity) {
      quantityInput.setValue(options.quantity)
    }

    const priceInput = new TextInputBuilder()
      .setCustomId('price')
      .setLabel('Price (optional, overrides auto-pricing)')
      .setPlaceholder('e.g., 130.50')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(15)

    if (options.price) {
      priceInput.setValue(options.price)
    }

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput)
    )
  } else {
    // Sell: Limit quantity (optional) + Price (optional)
    const limitInput = new TextInputBuilder()
      .setCustomId('limitQuantity')
      .setLabel('Limit Quantity (optional, for reserve/max)')
      .setPlaceholder('e.g., 500')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(10)

    if (options.limitQuantity) {
      limitInput.setValue(options.limitQuantity)
    }

    const priceInput = new TextInputBuilder()
      .setCustomId('price')
      .setLabel('Price (optional, overrides auto-pricing)')
      .setPlaceholder('e.g., 95.00')
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setMaxLength(15)

    if (options.price) {
      priceInput.setValue(options.price)
    }

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(limitInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput)
    )
  }

  return modal
}

/**
 * Options for creating an invoice edit modal
 */
export interface InvoiceEditModalOptions {
  /** Custom ID for the modal */
  modalId: string
  /** Modal title */
  title: string
  /** Direction of the invoice */
  direction: 'buy' | 'sell'
  /** Pre-filled item quantities (format: "COF:100, RAT:200") */
  quantities?: string
  /** Whether to show the location field (when location is missing) */
  showLocation?: boolean
  /** Pre-filled location value */
  location?: string
}

/**
 * Create a modal for editing invoice item quantities (and optionally location).
 * Allows users to adjust quantities before adding to invoice.
 *
 * @param options - Modal configuration options
 * @returns Configured ModalBuilder
 */
export function createInvoiceEditModal(options: InvoiceEditModalOptions): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(options.modalId).setTitle(options.title)

  const quantitiesInput = new TextInputBuilder()
    .setCustomId('quantities')
    .setLabel('Item Quantities (TICKER:QTY, ...)')
    .setPlaceholder('e.g., COF:100, RAT:200, DW:500')
    .setStyle(TextInputStyle.Paragraph)
    .setRequired(true)
    .setMaxLength(500)

  if (options.quantities) {
    quantitiesInput.setValue(options.quantities)
  }

  modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(quantitiesInput))

  // Add location field when location is missing/unresolved
  if (options.showLocation) {
    const locationInput = new TextInputBuilder()
      .setCustomId('location')
      .setLabel('Location')
      .setPlaceholder('e.g., Moria Station, Katoa, ANT, BEN')
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setMaxLength(50)

    if (options.location) {
      locationInput.setValue(options.location)
    }

    modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(locationInput))
  }

  return modal
}

/**
 * Options for creating a new order modal (from empty input)
 */
export interface NewOrderModalOptions {
  /** Custom ID for the modal */
  modalId: string
  /** Modal title */
  title: string
  /** Direction of the order */
  direction: 'buy' | 'sell'
  /** Pre-filled commodity (e.g., "COF" or "COF,CAF,H2O") */
  commodity?: string
  /** Pre-filled location (e.g., "Katoa" or "ANT") */
  location?: string
  /** Pre-filled quantity */
  quantity?: string
  /** Pre-filled price */
  price?: string
}

/**
 * Create a modal for entering all order details (commodity, location, quantity, price).
 * Used when user starts with empty input (!buy or !sell with no arguments).
 *
 * @param options - Modal configuration options
 * @returns Configured ModalBuilder
 */
export function createNewOrderModal(options: NewOrderModalOptions): ModalBuilder {
  const modal = new ModalBuilder().setCustomId(options.modalId).setTitle(options.title)

  // Commodity field
  const commodityInput = new TextInputBuilder()
    .setCustomId('commodity')
    .setLabel('Commodity ticker(s)')
    .setPlaceholder('e.g., COF or COF,CAF,H2O')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100)

  if (options.commodity) {
    commodityInput.setValue(options.commodity)
  }

  // Location field
  const locationInput = new TextInputBuilder()
    .setCustomId('location')
    .setLabel('Location')
    .setPlaceholder('e.g., Katoa, Montem, ANT, BEN')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(50)

  if (options.location) {
    locationInput.setValue(options.location)
  }

  // Quantity field
  const quantityInput = new TextInputBuilder()
    .setCustomId('quantity')
    .setLabel('Quantity')
    .setPlaceholder('e.g., 500')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(10)

  if (options.quantity) {
    quantityInput.setValue(options.quantity)
  }

  // Price field (optional)
  const priceInput = new TextInputBuilder()
    .setCustomId('price')
    .setLabel('Price (optional, uses auto-pricing if empty)')
    .setPlaceholder('e.g., 130.50')
    .setStyle(TextInputStyle.Short)
    .setRequired(false)
    .setMaxLength(15)

  if (options.price) {
    priceInput.setValue(options.price)
  }

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(commodityInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(locationInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(quantityInput),
    new ActionRowBuilder<TextInputBuilder>().addComponents(priceInput)
  )

  return modal
}
