// Re-export shim — actual logger lives in @kawakawa/services so the sync-worker
// and other packages can share it. Kept for backward-compat with existing
// imports; new code should import directly from '@kawakawa/services/utils'.
export { createLogger, redactObject, stripEmoji, type Logger } from '@kawakawa/services/utils'
export { default } from '@kawakawa/services/utils'
