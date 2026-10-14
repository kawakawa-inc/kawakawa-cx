import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import type { InvoiceLineItem } from '@kawakawa/types'
import ContractBreakdown from './ContractBreakdown.vue'

const writeText = vi.fn<(text: string) => Promise<void>>()

beforeAll(() => {
  // Vuetify's layout code observes element sizes; jsdom has no ResizeObserver.
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  // VSnackbar positions itself against the visual viewport.
  globalThis.visualViewport ??= Object.assign(new EventTarget(), {
    width: 1024,
    height: 768,
    offsetLeft: 0,
    offsetTop: 0,
    pageLeft: 0,
    pageTop: 0,
    scale: 1,
  }) as unknown as VisualViewport
})

let nextId = 1
function item(
  ticker: string,
  quantity: number,
  unitPrice: number,
  overrides: Partial<InvoiceLineItem> = {}
): InvoiceLineItem {
  return {
    id: nextId++,
    invoiceId: 1,
    sellOrderId: 1,
    buyOrderId: null,
    reservationId: null,
    reservationStatus: null,
    commodityTicker: ticker,
    locationId: 'BEN',
    quantity,
    unitPrice,
    currency: 'CIS',
    priceListCode: null,
    notes: null,
    orderType: 'sell',
    totalValue: Math.round(quantity * unitPrice * 100) / 100,
    ...overrides,
  }
}

function mountBreakdown(lineItems: InvoiceLineItem[]) {
  return mount(ContractBreakdown, {
    props: { lineItems, direction: 'received' },
    global: {
      plugins: [createVuetify({ components, directives })],
      stubs: { CommodityDisplay: { props: ['ticker'], template: '<span>{{ ticker }}</span>' } },
    },
    attachTo: document.body,
  })
}

const q = (w: VueWrapper, test: string) => w.find(`[data-test="${test}"]`)
const isDisabled = (w: VueWrapper, test: string) => q(w, test).attributes('disabled') !== undefined
const copied = () => writeText.mock.lastCall?.[0]

describe('ContractBreakdown XIT Paste', () => {
  let wrapper: VueWrapper | undefined

  beforeEach(() => {
    writeText.mockReset().mockResolvedValue()
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = undefined
    document.body.innerHTML = ''
  })

  it('copies a contract whose prices already fit, with no rounding controls', async () => {
    wrapper = mountBreakdown([item('RAT', 100, 530), item('DW', 50, 62.5)])
    expect(q(wrapper, 'xit-rounding').exists()).toBe(false)
    expect(isDisabled(wrapper, 'xit-paste')).toBe(false)

    await q(wrapper, 'xit-paste').trigger('click')
    await flushPromises()
    expect(copied()).toBe('RAT\t100\t530\nDW\t50\t62.5')
    expect(document.body.textContent).toContain('Copied 2 materials for XIT Paste')
  })

  it('disables XIT Paste until Up or Down is chosen, and Reset disables it again', async () => {
    wrapper = mountBreakdown([item('RAT', 100, 530), item('MCB', 2, 299250)])
    expect(q(wrapper, 'xit-rounding').exists()).toBe(true)
    expect(isDisabled(wrapper, 'xit-paste')).toBe(true)

    await q(wrapper, 'xit-round-up').trigger('click')
    expect(isDisabled(wrapper, 'xit-paste')).toBe(false)

    await q(wrapper, 'xit-round-none').trigger('click')
    expect(isDisabled(wrapper, 'xit-paste')).toBe(true)

    await q(wrapper, 'xit-round-down').trigger('click')
    expect(isDisabled(wrapper, 'xit-paste')).toBe(false)
  })

  it('previews rounded prices, floored line totals and the delta, then copies the same', async () => {
    wrapper = mountBreakdown([item('RAT', 100, 530), item('CIS', 2, 16.57)])
    const cisRow = () => wrapper!.find('[data-ticker="CIS"]')

    await q(wrapper, 'xit-round-up').trigger('click')
    expect(cisRow().find('[data-test="original-price"]').text()).toBe('16.57')
    expect(cisRow().find('[data-test="unit-price"]').text()).toContain('16.60 CIS')
    // floor(2 × 16.6) = 33, as PRUN does.
    expect(cisRow().find('[data-test="line-total"]').text()).toContain('33.00 CIS')
    expect(q(wrapper, 'contract-total').text()).toContain('53,033.00 CIS')
    expect(q(wrapper, 'total-delta').text()).toBe('−0.14 CIS')
    expect(q(wrapper, 'xit-rounding-note').exists()).toBe(true)

    await q(wrapper, 'xit-paste').trigger('click')
    await flushPromises()
    expect(copied()).toBe('RAT\t100\t530\nCIS\t2\t16.6')
    expect(document.body.textContent).toContain('(rounded up, −0.14 CIS)')

    await q(wrapper, 'xit-round-down').trigger('click')
    expect(cisRow().find('[data-test="unit-price"]').text()).toContain('16.50 CIS')
    await q(wrapper, 'xit-paste').trigger('click')
    await flushPromises()
    expect(copied()).toBe('RAT\t100\t530\nCIS\t2\t16.5')

    await q(wrapper, 'xit-round-none').trigger('click')
    expect(cisRow().find('[data-test="original-price"]').exists()).toBe(false)
    expect(q(wrapper, 'total-delta').exists()).toBe(false)
    expect(q(wrapper, 'contract-total').text()).toContain('53,033.14 CIS')
  })

  it('keeps rounding per contract', async () => {
    wrapper = mountBreakdown([
      item('MCB', 2, 299250),
      item('MCB', 2, 299250, { locationId: 'MOR' }),
    ])
    const cards = wrapper.findAll('[data-contract]')
    await cards[0].find('[data-test="xit-round-up"]').trigger('click')
    expect(cards[0].find('[data-test="xit-paste"]').attributes('disabled')).toBeUndefined()
    expect(cards[1].find('[data-test="xit-paste"]').attributes('disabled')).toBeDefined()
  })

  it('disables XIT Paste with no rounding controls when rounding cannot help', async () => {
    wrapper = mountBreakdown([item('RAT', 100, 530), item('RAT', 50, 540)])
    expect(q(wrapper, 'xit-rounding').exists()).toBe(false)
    expect(isDisabled(wrapper, 'xit-paste')).toBe(true)
  })

  it('shows an error instead of throwing when the clipboard is unavailable', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    document.execCommand = vi.fn(() => false) as unknown as typeof document.execCommand
    vi.spyOn(console, 'error').mockImplementation(() => {})
    wrapper = mountBreakdown([item('RAT', 100, 530)])
    await q(wrapper, 'xit-paste').trigger('click')
    await flushPromises()
    expect(document.body.textContent).toContain('Failed to copy to clipboard')
  })
})
