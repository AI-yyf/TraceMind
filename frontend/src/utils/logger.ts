/**
 * Development-only logger utility.
 * In production and test runs, log calls stay silent to avoid console noise.
 */

const isDev = import.meta.env.DEV
const nodeProcess =
  typeof globalThis === 'object'
    ? (globalThis as { process?: { env?: { NODE_ENV?: string } } }).process
    : undefined
const isTest =
  import.meta.env.MODE === 'test' ||
  nodeProcess?.env?.NODE_ENV === 'test'
const isLoggingEnabled = isDev && !isTest

function formatPrefix(scope: string): string {
  return `[${scope}]`
}

export const logger = {
  error(scope: string, message: string, error?: unknown): void {
    if (!isLoggingEnabled) return
    const prefix = formatPrefix(scope)
    if (error !== undefined) {
      console.error(`${prefix} ${message}`, error)
    } else {
      console.error(`${prefix} ${message}`)
    }
  },

  warn(scope: string, message: string, detail?: unknown): void {
    if (!isLoggingEnabled) return
    const prefix = formatPrefix(scope)
    if (detail !== undefined) {
      console.warn(`${prefix} ${message}`, detail)
    } else {
      console.warn(`${prefix} ${message}`)
    }
  },

  info(scope: string, message: string, detail?: unknown): void {
    if (!isLoggingEnabled) return
    const prefix = formatPrefix(scope)
    if (detail !== undefined) {
      console.info(`${prefix} ${message}`, detail)
    } else {
      console.info(`${prefix} ${message}`)
    }
  },
}

export default logger
