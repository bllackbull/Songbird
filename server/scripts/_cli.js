import path from 'node:path'
import { fileURLToPath } from 'node:url'
import readline from 'node:readline/promises'
import { stdin as input, stdout as output } from 'node:process'

export const scriptDir = path.dirname(fileURLToPath(import.meta.url))
export const serverDir = path.resolve(scriptDir, '..')
export const dataDir = path.resolve(serverDir, '..', 'data')

function parseNpmOriginalArgs() {
  const raw = process.env.npm_config_argv
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    const original = Array.isArray(parsed?.original) ? parsed.original : []
    const normalized = original.map((arg) => String(arg).trim()).filter(Boolean)
    const lifecycle = String(process.env.npm_lifecycle_event || '').trim()
    if (!lifecycle) {
      return normalized
    }
    const scriptIndex = normalized.findIndex((arg) => arg === lifecycle)
    if (scriptIndex >= 0) {
      return normalized.slice(scriptIndex + 1).filter((arg) => arg !== '--')
    }
    return normalized
  } catch (_) {
    return []
  }
}

export function getNpmOriginalArgs() {
  return parseNpmOriginalArgs()
}

export function getCliArgs() {
  const directArgs = process.argv.slice(2).map((arg) => String(arg).trim()).filter(Boolean)
  const npmArgs = parseNpmOriginalArgs()
  if (!directArgs.length) return npmArgs
  if (!npmArgs.length) return directArgs
  const merged = [...directArgs]
  npmArgs.forEach((arg) => {
    if (!merged.includes(arg)) {
      merged.push(arg)
    }
  })
  return merged
}

export function hasForceYes(args = []) {
  const normalized = args.map((arg) => String(arg).toLowerCase())
  if (normalized.includes('-y') || normalized.includes('--yes')) return true
  const envYes = String(process.env.npm_config_yes || '').toLowerCase()
  if (envYes === 'true' || envYes === '1') return true
  const envY = String(process.env.npm_config_y || '').toLowerCase()
  if (envY === 'true' || envY === '1') return true
  return false
}

export function getPositionalArgs(args = []) {
  return args.filter((arg) => !String(arg).startsWith('-'))
}

export function getFlagValue(args = [], flagName) {
  const index = args.findIndex((arg) => String(arg).toLowerCase() === String(flagName).toLowerCase())
  if (index >= 0) {
    return args[index + 1] || null
  }
  const envKey = `npm_config_${String(flagName)
    .replace(/^-+/, '')
    .replace(/-/g, '_')
    .toLowerCase()}`
  const envValue = process.env[envKey]
  if (typeof envValue === 'string' && envValue.trim()) {
    return envValue.trim()
  }
  return null
}

export async function confirmAction({ prompt, force = false, forceHint }) {
  if (force) return true
  if (!input.isTTY) {
    if (forceHint) {
      console.error(forceHint)
    } else {
      console.error('Refusing to continue in non-interactive mode without -y/--yes.')
    }
    process.exit(1)
  }

  const rl = readline.createInterface({ input, output })
  try {
    while (true) {
      const answer = (await rl.question(`${prompt} (y/n): `)).trim().toLowerCase()
      if (answer === 'y' || answer === 'yes') return true
      if (answer === 'n' || answer === 'no') return false
    }
  } finally {
    rl.close()
  }
}
