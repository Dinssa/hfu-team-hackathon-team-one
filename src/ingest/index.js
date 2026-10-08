// "Process next file": finds the lowest-numbered file in data/incoming that has
// not been ingested yet and applies it. Run as `npm run ingest`, or from the
// button on the home page.
import { readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { all, ensureSchema } from '../db.js'
import { ingestApplicationsFile } from './applications.js'

const here = path.dirname(fileURLToPath(import.meta.url))
export const INCOMING_DIR = path.join(here, '..', '..', 'data', 'incoming')

const HANDLERS = [
  { suffix: '-visa-applications.json', type: 'applications', handler: ingestApplicationsFile }
  // arrivals (M5) and EOI offers (M12) are added here when those milestones land
]

export function listIncomingFiles () {
  return readdirSync(INCOMING_DIR)
    .filter(name => /^\d{2}-/.test(name))
    .sort((x, y) => x.localeCompare(y, 'en', { numeric: true }))
}

export async function ingestState () {
  const done = new Set((await all('SELECT file_name FROM raw.ingested_files')).map(r => r.file_name))
  const files = listIncomingFiles()
  const remaining = files.filter(f => !done.has(f))
  return { files, done, next: remaining[0] ?? null, remaining: remaining.length }
}

export async function ingestNextFile () {
  const { next } = await ingestState()
  if (!next) return { fileName: null, summary: null, message: 'Every file in data/incoming has been processed.' }
  return ingestFile(next)
}

export async function ingestFile (fileName) {
  const entry = HANDLERS.find(h => fileName.endsWith(h.suffix))
  if (!entry) {
    throw new Error(`${fileName}: this file type is not supported yet. Build the milestone that ingests it first.`)
  }
  const summary = await entry.handler(path.join(INCOMING_DIR, fileName), fileName)
  const message = `${fileName}: ${summary.rows} rows read, ${summary.created} created, ${summary.skipped} already present, ${summary.rejected} rejected.`
  return { fileName, type: entry.type, summary, message }
}

// CLI entry: `node src/ingest/index.js` or `node src/ingest/index.js 03-visa-applications.json`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await ensureSchema()
  const requested = process.argv[2]
  try {
    const result = requested ? await ingestFile(requested) : await ingestNextFile()
    console.log(result.message)
  } catch (err) {
    console.error(err.message)
    process.exitCode = 1
  }
}
