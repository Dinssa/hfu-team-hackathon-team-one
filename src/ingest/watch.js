// Runs inside the app process (the only process allowed to write the database):
// processes everything pending on start, then again whenever a feed folder changes.
import { existsSync, watch } from 'node:fs'
import path from 'node:path'
import { HANDLERS, INCOMING_DIR, ingestPending } from './index.js'

// Copying a file in fires several events; wait for them to settle before reading it.
const SETTLE_MS = 500

export function watchIncoming () {
  let timer = null
  const schedule = () => {
    clearTimeout(timer)
    timer = setTimeout(processPending, SETTLE_MS)
  }

  for (const { folder } of HANDLERS) {
    const dir = path.join(INCOMING_DIR, folder)
    if (!existsSync(dir)) {
      console.warn(`Ingest: ${dir} does not exist, not watching it`)
      continue
    }
    watch(dir, schedule).on('error', err => console.error(`Ingest: stopped watching ${dir}: ${err.message}`))
  }

  return processPending()
}

async function processPending () {
  try {
    for (const r of await ingestPending()) {
      (r.error ? console.error : console.log)(`Ingest: ${r.message}`)
    }
  } catch (err) {
    console.error(`Ingest: ${err.message}`)
  }
}
