// Ingests files from data/incoming that have not been processed yet. Each feed
// lives in its own folder; folders are processed in HANDLERS order, files within
// a folder in name order. The running app processes everything pending on start
// and whenever a file lands (src/ingest/watch.js). `npm run ingest` does the same
// once, while the app is stopped. The home page button processes one file.
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { all, ensureSchema } from '../db.js'
import { ingestApplicationsFile } from './applications.js'

const here = path.dirname(fileURLToPath(import.meta.url))
export const INCOMING_DIR = process.env.SHARE_INCOMING ?? path.join(here, '..', '..', 'data', 'incoming')

// Folders without a handler (visa_arrivals, uam, eoi) are left alone until their milestone lands.
export const HANDLERS = [
  { folder: 'visa_applications', extension: '.json', type: 'applications', handler: ingestApplicationsFile }
]

// File names are paths relative to data/incoming, e.g. "visa_applications/application_1a2b.json".
export function listIncomingFiles () {
  return HANDLERS.flatMap(({ folder, extension }) => {
    const dir = path.join(INCOMING_DIR, folder)
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter(name => name.endsWith(extension))
      .sort((x, y) => x.localeCompare(y, 'en', { numeric: true }))
      .map(name => `${folder}/${name}`)
  })
}

export async function ingestState () {
  const done = new Set((await all('SELECT file_name FROM raw.ingested_files')).map(r => r.file_name))
  const files = listIncomingFiles()
  const remaining = files.filter(f => !done.has(f))
  return { files, done, next: remaining[0] ?? null, remaining: remaining.length }
}

// The app shares one DuckDB connection, so ingests must never overlap: the
// watcher, the home page button and startup all queue through here.
let queue = Promise.resolve()
function exclusive (fn) {
  const result = queue.then(fn)
  queue = result.catch(() => {})
  return result
}

export function ingestNextFile () {
  return exclusive(async () => {
    const { next } = await ingestState()
    if (!next) return { fileName: null, summary: null, message: 'Every file in data/incoming has been processed.' }
    return ingestOne(next)
  })
}

export function ingestFile (fileName) {
  return exclusive(() => ingestOne(fileName))
}

// A file that fails (for example, JSON still being written) stays pending and is retried on the next run.
export function ingestPending () {
  return exclusive(async () => {
    const { files, done } = await ingestState()
    const results = []
    for (const fileName of files.filter(f => !done.has(f))) {
      try {
        results.push(await ingestOne(fileName))
      } catch (err) {
        results.push({ fileName, error: err, message: `${fileName}: ${err.message}` })
      }
    }
    return results
  })
}

async function ingestOne (fileName) {
  const entry = HANDLERS.find(h => fileName.startsWith(`${h.folder}/`) && fileName.endsWith(h.extension))
  if (!entry) {
    throw new Error(`${fileName}: this file type is not supported yet. Build the milestone that ingests it first.`)
  }
  const summary = await entry.handler(path.join(INCOMING_DIR, fileName), fileName)
  const message = `${fileName}: ${summary.rows} rows read, ${summary.created} created, ${summary.skipped} already present, ${summary.rejected} rejected.`
  return { fileName, type: entry.type, summary, message }
}

// CLI entry: `node src/ingest/index.js` (everything pending) or `node src/ingest/index.js visa_applications/application_1a2b.json`
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await ensureSchema()
  const requested = process.argv[2]
  try {
    const results = requested ? [await ingestFile(requested)] : await ingestPending()
    if (results.length === 0) console.log('Every file in data/incoming has been processed.')
    for (const r of results) (r.error ? console.error : console.log)(r.message)
    if (results.some(r => r.error)) process.exitCode = 1
  } catch (err) {
    console.error(err.message)
    process.exitCode = 1
  }
}
