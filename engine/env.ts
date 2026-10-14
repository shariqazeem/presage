import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// The engine runs outside Next.js, so it reads .env.local and .env itself. Real environment
// variables always win over the files.
for (const file of ['.env.local', '.env']) {
  const path = resolve(process.cwd(), file)
  if (!existsSync(path)) continue
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (!m || process.env[m[1]] !== undefined) continue
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2')
  }
}

export function need(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`Missing ${name}`)
  return v
}
