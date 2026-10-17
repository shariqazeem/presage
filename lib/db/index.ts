import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import * as schema from './schema'

export type DB = BetterSQLite3Database<typeof schema>

const globalForDb = globalThis as unknown as { calledDb?: DB }

/** One SQLite file shared by the web app and the engine (WAL mode, so readers never block the writer). */
export function getDb(): DB {
  if (globalForDb.calledDb) return globalForDb.calledDb
  const path = resolve(process.env.CALLED_DB_PATH ?? 'var/called.db')
  mkdirSync(dirname(path), { recursive: true })
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('foreign_keys = ON')
  const db = drizzle(sqlite, { schema })
  migrate(db, { migrationsFolder: resolve(process.env.CALLED_MIGRATIONS ?? 'drizzle') })
  globalForDb.calledDb = db
  return db
}

export { schema }
