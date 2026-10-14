import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useClipboard } from './useClipboard'

const writeText = vi.fn<(text: string) => Promise<void>>()
const execCommand = vi.fn<(command: string) => boolean>()

function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true })
}

describe('useClipboard', () => {
  beforeEach(() => {
    writeText.mockReset()
    execCommand.mockReset()
    setClipboard({ writeText })
    document.execCommand = execCommand as unknown as typeof document.execCommand
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('writes with the Clipboard API when it is available', async () => {
    writeText.mockResolvedValue()
    await expect(useClipboard().copy('RAT\t100\t530')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('RAT\t100\t530')
    expect(execCommand).not.toHaveBeenCalled()
  })

  it('falls back to execCommand when the Clipboard API rejects', async () => {
    writeText.mockRejectedValue(new DOMException('denied', 'NotAllowedError'))
    let copied: string | undefined
    execCommand.mockImplementation(() => {
      copied = (document.querySelector('textarea') as HTMLTextAreaElement).value
      return true
    })

    await expect(useClipboard().copy('hello')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
    expect(copied).toBe('hello')
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('falls back to execCommand when the Clipboard API is missing', async () => {
    setClipboard(undefined)
    execCommand.mockReturnValue(true)
    await expect(useClipboard().copy('hello')).resolves.toBe(true)
    expect(execCommand).toHaveBeenCalledWith('copy')
  })

  it('resolves false instead of throwing when every method fails', async () => {
    writeText.mockRejectedValue(new Error('denied'))
    execCommand.mockReturnValue(false)
    await expect(useClipboard().copy('hello')).resolves.toBe(false)
    expect(document.querySelector('textarea')).toBeNull()
  })

  it('resolves false when execCommand throws', async () => {
    setClipboard(undefined)
    execCommand.mockImplementation(() => {
      throw new Error('unsupported')
    })
    await expect(useClipboard().copy('hello')).resolves.toBe(false)
  })

  it('places the fallback textarea inside an open dialog and restores focus', async () => {
    setClipboard(undefined)
    const overlay = document.createElement('div')
    overlay.className = 'v-overlay__content'
    const button = document.createElement('button')
    overlay.appendChild(button)
    document.body.appendChild(overlay)
    button.focus()

    let parent: Element | null = null
    execCommand.mockImplementation(() => {
      parent = document.querySelector('textarea')!.parentElement
      return true
    })

    await useClipboard().copy('hello')
    expect(parent).toBe(overlay)
    expect(document.activeElement).toBe(button)
  })
})
