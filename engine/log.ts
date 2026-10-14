type Level = 'info' | 'warn' | 'error'

function line(level: Level, area: string, msg: string, data?: Record<string, unknown>) {
  const ts = new Date().toISOString()
  const extra = data ? ' ' + JSON.stringify(data, (_, v) => (typeof v === 'bigint' ? v.toString() : v)) : ''
  const out = `${ts} ${level.toUpperCase().padEnd(5)} [${area}] ${msg}${extra}`
  if (level === 'error') console.error(out)
  else console.log(out)
}

export const log = (area: string) => ({
  info: (msg: string, data?: Record<string, unknown>) => line('info', area, msg, data),
  warn: (msg: string, data?: Record<string, unknown>) => line('warn', area, msg, data),
  error: (msg: string, data?: Record<string, unknown>) => line('error', area, msg, data),
})

export const errMsg = (e: unknown) => (e instanceof Error ? e.message.split('\n')[0] : String(e))
