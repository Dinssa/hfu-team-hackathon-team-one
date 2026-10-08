// DuckDB connection singleton. Only this process writes to the database file.
// Analysts and other tools must open data/share.duckdb read-only, or query the
// Parquet snapshots in data/reporting/ instead.
import { DuckDBInstance } from '@duckdb/node-api'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
export const DB_PATH = process.env.SHARE_DB ?? path.join(here, '..', 'data', 'share.duckdb')

let connection

export async function getConnection () {
  if (!connection) {
    const instance = await DuckDBInstance.create(DB_PATH)
    connection = await instance.connect()
  }
  return connection
}

// Run a statement with positional parameters ($1, $2, ...). Returns nothing.
export async function run (sql, params = []) {
  const conn = await getConnection()
  await conn.run(sql, params)
}

// Run a query and return plain JS row objects.
export async function all (sql, params = []) {
  const conn = await getConnection()
  const reader = await conn.runAndReadAll(sql, params)
  return reader.getRowObjectsJS()
}

export async function one (sql, params = []) {
  const rows = await all(sql, params)
  return rows[0] ?? null
}

// Apply src/schema.sql. Every statement is CREATE IF NOT EXISTS, so safe on every boot.
export async function ensureSchema () {
  const sql = readFileSync(path.join(here, 'schema.sql'), 'utf8')
    .split('\n')
    .map(line => line.replace(/--.*$/, ''))
    .join('\n')
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0)
  for (const statement of statements) {
    await run(statement)
  }
}
