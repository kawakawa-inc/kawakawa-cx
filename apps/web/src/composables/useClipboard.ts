/**
 * Composable for writing text to the clipboard.
 *
 * Uses the async Clipboard API, falling back to a hidden textarea and
 * `document.execCommand('copy')` when the API is missing (insecure context,
 * older browser) or rejects (permission denied). Never throws.
 */
export function useClipboard() {
  const copy = async (text: string): Promise<boolean> => {
    let apiError: unknown = 'Clipboard API unavailable'
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text)
        return true
      } catch (error) {
        apiError = error
      }
    }
    if (copyWithTextarea(text)) return true
    console.error('Failed to copy to clipboard', apiError)
    return false
  }

  return { copy }
}

function copyWithTextarea(text: string): boolean {
  const previousFocus = document.activeElement as HTMLElement | null
  // Inside a Vuetify dialog the focus trap pulls focus back out of anything
  // appended to <body>, which leaves nothing selected to copy.
  const container = previousFocus?.closest('.v-overlay__content') ?? document.body

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '0'
  textarea.style.left = '0'
  textarea.style.opacity = '0'
  container.appendChild(textarea)

  try {
    textarea.select()
    return typeof document.execCommand === 'function' && document.execCommand('copy')
  } catch {
    return false
  } finally {
    container.removeChild(textarea)
    previousFocus?.focus?.()
  }
}
