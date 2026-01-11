/**
 * Pagination Component for Discord Bot
 * Provides reusable pagination with Discord buttons.
 */

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  ComponentType,
} from 'discord.js'

export interface PaginatedItem {
  /** Field name shown in embed */
  name: string
  /** Field value shown in embed */
  value: string
  /** Whether to display inline */
  inline?: boolean
}

export interface PaginationOptions {
  /** Maximum items per page (hard limit to prevent too many fields) */
  pageSize?: number
  /** Maximum embed size per page in characters (Discord limit is 6000) */
  maxEmbedSize?: number
  /** Timeout for button interactions in ms (default: 5 minutes) */
  timeout?: number
  /** Whether to show page numbers in footer */
  showPageNumbers?: boolean
  /** Custom ID prefix for buttons */
  idPrefix?: string
  /** Whether to allow sharing (posting publicly) */
  allowShare?: boolean
  /** Custom footer text (page info appended) */
  footerText?: string
  /** Whether the initial response should be ephemeral (default: true) */
  ephemeral?: boolean
}

const DEFAULT_OPTIONS: Required<PaginationOptions> = {
  pageSize: 25, // Max fields Discord allows
  maxEmbedSize: 5500, // Leave room for title, description, footer (~500 chars buffer)
  timeout: 5 * 60 * 1000, // 5 minutes
  showPageNumbers: true,
  idPrefix: 'page',
  allowShare: true,
  footerText: '',
  ephemeral: true,
}

/**
 * Create pagination buttons for a given page.
 */
function createButtons(
  currentPage: number,
  totalPages: number,
  idPrefix: string,
  allowShare: boolean
): ActionRowBuilder<ButtonBuilder> {
  const row = new ActionRowBuilder<ButtonBuilder>()

  // Previous button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${idPrefix}:prev`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0)
  )

  // Page indicator (disabled button showing current page)
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${idPrefix}:info`)
      .setLabel(`${currentPage + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  )

  // Next button
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`${idPrefix}:next`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages - 1)
  )

  // Share button (posts publicly)
  if (allowShare) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:share`)
        .setLabel('📢 Share')
        .setStyle(ButtonStyle.Primary)
    )
  }

  return row
}

/**
 * Build an embed for a specific page of items.
 */
function buildPageEmbed(
  baseEmbed: EmbedBuilder,
  items: PaginatedItem[],
  currentPage: number,
  totalPages: number,
  _totalItems: number,
  options: Required<PaginationOptions>
): EmbedBuilder {
  const embed = EmbedBuilder.from(baseEmbed)

  // Clear existing fields and add page items
  embed.setFields(...items.map(item => ({ ...item, inline: item.inline ?? true })))

  // Update footer - custom text on first line, page info on second line
  const footerParts: string[] = []
  if (options.footerText) {
    footerParts.push(options.footerText)
  }
  if (options.showPageNumbers) {
    footerParts.push(`Page ${currentPage + 1}/${totalPages}`)
  }
  if (footerParts.length > 0) {
    embed.setFooter({ text: footerParts.join('\n') })
  }

  return embed
}

/**
 * Calculate the character size of a paginated item (name + value).
 */
function getItemSize(item: PaginatedItem): number {
  return item.name.length + item.value.length
}

/**
 * Pre-calculate pages based on both item count and character size limits.
 * Returns an array of page arrays, where each page array contains items for that page.
 */
function calculatePages(
  allItems: PaginatedItem[],
  maxItemsPerPage: number,
  maxEmbedSize: number
): PaginatedItem[][] {
  const pages: PaginatedItem[][] = []
  let currentPage: PaginatedItem[] = []
  let currentPageSize = 0

  for (const item of allItems) {
    const itemSize = getItemSize(item)

    // Check if adding this item would exceed limits
    const wouldExceedItems = currentPage.length >= maxItemsPerPage
    const wouldExceedSize = currentPageSize + itemSize > maxEmbedSize

    if (currentPage.length > 0 && (wouldExceedItems || wouldExceedSize)) {
      // Start a new page
      pages.push(currentPage)
      currentPage = []
      currentPageSize = 0
    }

    currentPage.push(item)
    currentPageSize += itemSize
  }

  // Don't forget the last page
  if (currentPage.length > 0) {
    pages.push(currentPage)
  }

  // Ensure at least one empty page if no items
  if (pages.length === 0) {
    pages.push([])
  }

  return pages
}

/**
 * Send a paginated response with interactive buttons.
 *
 * @param interaction - The command interaction to reply to
 * @param baseEmbed - Base embed to use (title, color, description)
 * @param allItems - All items to paginate
 * @param options - Pagination options
 */
export async function sendPaginatedResponse(
  interaction: ChatInputCommandInteraction,
  baseEmbed: EmbedBuilder,
  allItems: PaginatedItem[],
  options?: PaginationOptions
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const { pageSize, maxEmbedSize, timeout, idPrefix, allowShare, ephemeral } = opts

  // Pre-calculate pages based on size limits
  const pages = calculatePages(allItems, pageSize, maxEmbedSize)
  const totalPages = pages.length
  let currentPage = 0

  // Get items for current page
  const getPageItems = (page: number): PaginatedItem[] => {
    return pages[page] || []
  }

  // Build initial embed and buttons
  const embed = buildPageEmbed(baseEmbed, getPageItems(0), 0, totalPages, allItems.length, opts)

  // Only show buttons if there's more than one page or share is enabled (and is ephemeral)
  const showShareButton = allowShare && ephemeral
  const showButtons = totalPages > 1 || showShareButton
  const components = showButtons ? [createButtons(0, totalPages, idPrefix, showShareButton)] : []

  // Send initial response
  const response = await interaction.reply({
    embeds: [embed],
    components,
    flags: ephemeral ? MessageFlags.Ephemeral : undefined,
  })

  // If no buttons needed, we're done
  if (!showButtons) {
    return
  }

  // Create collector for button interactions
  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: timeout,
    filter: i => i.customId.startsWith(idPrefix) && i.user.id === interaction.user.id,
  })

  collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
    const action = buttonInteraction.customId.split(':')[1]

    switch (action) {
      case 'prev':
        if (currentPage > 0) {
          currentPage--
        }
        break
      case 'next':
        if (currentPage < totalPages - 1) {
          currentPage++
        }
        break
      case 'share': {
        // Post current page publicly (non-ephemeral)
        // Prefer server nickname over global display name (if member has displayName property)
        const member = interaction.member
        const sharedByName =
          member && 'displayName' in member ? member.displayName : interaction.user.displayName
        await buttonInteraction.reply({
          embeds: [
            buildPageEmbed(
              baseEmbed,
              getPageItems(currentPage),
              currentPage,
              totalPages,
              allItems.length,
              { ...opts, footerText: `Shared by ${sharedByName}` }
            ),
          ],
        })
        return // Don't update the ephemeral message
      }
      default:
        return
    }

    // Update the message with new page
    const newEmbed = buildPageEmbed(
      baseEmbed,
      getPageItems(currentPage),
      currentPage,
      totalPages,
      allItems.length,
      opts
    )

    await buttonInteraction.update({
      embeds: [newEmbed],
      components: [createButtons(currentPage, totalPages, idPrefix, showShareButton)],
    })
  })

  collector.on('end', async () => {
    // Disable buttons after timeout
    try {
      const disabledRow = new ActionRowBuilder<ButtonBuilder>()
      disabledRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`${idPrefix}:expired`)
          .setLabel('Session expired - run command again')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
      await interaction.editReply({ components: [disabledRow] })
    } catch {
      // Interaction may have been deleted
    }
  })
}

/**
 * Send a simple paginated response without interaction (for when items fit).
 * Still allows sharing.
 */
export async function sendSimpleResponse(
  interaction: ChatInputCommandInteraction,
  embed: EmbedBuilder,
  options?: { allowShare?: boolean; ephemeral?: boolean }
): Promise<void> {
  const idPrefix = 'simple'
  const allowShare = options?.allowShare ?? true
  const ephemeral = options?.ephemeral ?? true

  // Only show share button if ephemeral and share is allowed
  const showShareButton = allowShare && ephemeral
  const components = showShareButton
    ? [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${idPrefix}:share`)
            .setLabel('📢 Share')
            .setStyle(ButtonStyle.Primary)
        ),
      ]
    : []

  const response = await interaction.reply({
    embeds: [embed],
    components,
    flags: ephemeral ? MessageFlags.Ephemeral : undefined,
  })

  if (!showShareButton) {
    return
  }

  // Collector for share button
  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 5 * 60 * 1000,
    filter: i => i.customId === `${idPrefix}:share` && i.user.id === interaction.user.id,
  })

  collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
    // Clone embed with "Shared by" footer
    // Prefer server nickname over global display name (if member has displayName property)
    const member = interaction.member
    const sharedByName =
      member && 'displayName' in member ? member.displayName : interaction.user.displayName
    const sharedEmbed = EmbedBuilder.from(embed)
    sharedEmbed.setFooter({ text: `Shared by ${sharedByName}` })

    await buttonInteraction.reply({
      embeds: [sharedEmbed],
    })
  })
}

/**
 * Extra button configuration for paginated responses.
 */
export interface ExtraButton {
  /** Custom ID for the button (will be prefixed with idPrefix) */
  id: string
  /** Button label text */
  label: string
  /** Button style (default: Primary) */
  style?: ButtonStyle
  /** Optional emoji */
  emoji?: string
  /** Handler for button click */
  onClick: (interaction: ButtonInteraction) => Promise<void>
}

/**
 * Extended pagination options with extra buttons.
 */
export interface PaginationOptionsWithExtraButtons extends PaginationOptions {
  /** Additional buttons to show alongside pagination */
  extraButtons?: ExtraButton[]
}

/**
 * Create pagination buttons with optional extra buttons.
 */
function createButtonsWithExtras(
  currentPage: number,
  totalPages: number,
  idPrefix: string,
  allowShare: boolean,
  extraButtons: ExtraButton[] = []
): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = []
  const mainRow = new ActionRowBuilder<ButtonBuilder>()

  // Previous button
  mainRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`${idPrefix}:prev`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage === 0)
  )

  // Page indicator (disabled button showing current page)
  mainRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`${idPrefix}:info`)
      .setLabel(`${currentPage + 1} / ${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  )

  // Next button
  mainRow.addComponents(
    new ButtonBuilder()
      .setCustomId(`${idPrefix}:next`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(currentPage >= totalPages - 1)
  )

  // Share button (posts publicly)
  if (allowShare) {
    mainRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`${idPrefix}:share`)
        .setLabel('📢 Share')
        .setStyle(ButtonStyle.Primary)
    )
  }

  rows.push(mainRow)

  // Add extra buttons in a second row if present
  if (extraButtons.length > 0) {
    const extraRow = new ActionRowBuilder<ButtonBuilder>()
    for (const btn of extraButtons) {
      const button = new ButtonBuilder()
        .setCustomId(`${idPrefix}:${btn.id}`)
        .setLabel(btn.label)
        .setStyle(btn.style ?? ButtonStyle.Success)

      if (btn.emoji) {
        button.setEmoji(btn.emoji)
      }

      extraRow.addComponents(button)
    }
    rows.push(extraRow)
  }

  return rows
}

/**
 * Send a paginated response with interactive buttons and optional extra buttons.
 *
 * @param interaction - The command interaction to reply to
 * @param baseEmbed - Base embed to use (title, color, description)
 * @param allItems - All items to paginate
 * @param options - Pagination options with extra buttons
 */
export async function sendPaginatedResponseWithExtraButtons(
  interaction: ChatInputCommandInteraction,
  baseEmbed: EmbedBuilder,
  allItems: PaginatedItem[],
  options?: PaginationOptionsWithExtraButtons
): Promise<void> {
  const opts = { ...DEFAULT_OPTIONS, ...options }
  const { pageSize, maxEmbedSize, timeout, idPrefix, allowShare, ephemeral } = opts
  const extraButtons = options?.extraButtons ?? []

  // Pre-calculate pages based on size limits
  const pages = calculatePages(allItems, pageSize, maxEmbedSize)
  const totalPages = pages.length
  let currentPage = 0

  // Get items for current page
  const getPageItems = (page: number): PaginatedItem[] => {
    return pages[page] || []
  }

  // Build initial embed and buttons
  const embed = buildPageEmbed(baseEmbed, getPageItems(0), 0, totalPages, allItems.length, opts)

  // Only show buttons if there's more than one page or share is enabled (and is ephemeral) or extra buttons
  const showShareButton = allowShare && ephemeral
  const showButtons = totalPages > 1 || showShareButton || extraButtons.length > 0
  const components = showButtons
    ? createButtonsWithExtras(0, totalPages, idPrefix, showShareButton, extraButtons)
    : []

  // Send initial response
  const response = await interaction.reply({
    embeds: [embed],
    components,
    flags: ephemeral ? MessageFlags.Ephemeral : undefined,
  })

  // If no buttons needed, we're done
  if (!showButtons) {
    return
  }

  // Create collector for button interactions
  const collector = response.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: timeout,
    filter: i => i.customId.startsWith(idPrefix) && i.user.id === interaction.user.id,
  })

  collector.on('collect', async (buttonInteraction: ButtonInteraction) => {
    const action = buttonInteraction.customId.split(':')[1]

    // Check for extra button handlers
    const extraButton = extraButtons.find(btn => btn.id === action)
    if (extraButton) {
      await extraButton.onClick(buttonInteraction)
      return
    }

    switch (action) {
      case 'prev':
        if (currentPage > 0) {
          currentPage--
        }
        break
      case 'next':
        if (currentPage < totalPages - 1) {
          currentPage++
        }
        break
      case 'share': {
        // Post current page publicly (non-ephemeral)
        const member = interaction.member
        const sharedByName =
          member && 'displayName' in member ? member.displayName : interaction.user.displayName
        await buttonInteraction.reply({
          embeds: [
            buildPageEmbed(
              baseEmbed,
              getPageItems(currentPage),
              currentPage,
              totalPages,
              allItems.length,
              { ...opts, footerText: `Shared by ${sharedByName}` }
            ),
          ],
        })
        return // Don't update the ephemeral message
      }
      default:
        return
    }

    // Update the message with new page
    const newEmbed = buildPageEmbed(
      baseEmbed,
      getPageItems(currentPage),
      currentPage,
      totalPages,
      allItems.length,
      opts
    )

    await buttonInteraction.update({
      embeds: [newEmbed],
      components: createButtonsWithExtras(
        currentPage,
        totalPages,
        idPrefix,
        showShareButton,
        extraButtons
      ),
    })
  })

  collector.on('end', async () => {
    // Disable buttons after timeout
    try {
      const disabledRow = new ActionRowBuilder<ButtonBuilder>()
      disabledRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`${idPrefix}:expired`)
          .setLabel('Session expired - run command again')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(true)
      )
      await interaction.editReply({ components: [disabledRow] })
    } catch {
      // Interaction may have been deleted
    }
  })
}
