// Case formation (M3). Applications sharing a sponsor and an accommodation
// address belong to one case (accommodation request). Runs after every ingest
// and on start, picks up applications with no case yet, and is idempotent.
import { all, one, run } from '../db.js'

export const CHECK_KINDS = [
  { kind: 1, name: 'Accommodation exists' },
  { kind: 2, name: 'Accommodation suitable' },
  { kind: 3, name: 'DBS check and sponsor suitable' },
  { kind: 4, name: 'Guests have arrived in their accommodation' }
]

export async function formCases () {
  const pending = await all(
    `SELECT a.id, a.uan, a.event_datetime, a.sponsor_id, a.accommodation_id,
            s.family_name AS sponsor_family_name, s.council AS sponsor_council,
            acc.address, acc.council AS accommodation_council
     FROM serve.applications a
     LEFT JOIN serve.sponsors s ON s.id = a.sponsor_id
     LEFT JOIN serve.accommodations acc ON acc.id = a.accommodation_id
     WHERE a.case_id IS NULL
     ORDER BY a.event_datetime, a.id`
  )
  let formed = 0
  for (const app of pending) {
    const caseId = await findOrCreateCase(app)
    await run('UPDATE serve.applications SET case_id = $1 WHERE id = $2', [caseId, app.id])
    await run(
      `INSERT INTO serve.case_events (case_id, occurred_at, kind, description)
       VALUES ($1, coalesce($2::TIMESTAMP, current_timestamp), 'application_received', $3)`,
      [caseId, app.event_datetime ? new Date(app.event_datetime).toISOString().replace('T', ' ').replace('Z', '') : null,
        `Application ${app.uan ?? app.id} received and added to this case`]
    )
    formed += 1
  }
  return formed
}

async function findOrCreateCase (app) {
  // No accommodation yet (guest not staying with the sponsor): accommodation_id 0, one case per sponsor without an address.
  const key = `${app.sponsor_id ?? 0}|${app.accommodation_id ?? 0}`
  const existing = await one('SELECT id FROM serve.cases WHERE dedupe_key = $1', [key])
  if (existing) return existing.id

  const council = app.accommodation_council ?? app.sponsor_council ?? null
  const title = app.address
    ? `${app.sponsor_family_name ?? 'Unknown sponsor'} household at ${shortAddress(app.address)}`
    : `${app.sponsor_family_name ?? 'Unknown sponsor'} household, accommodation to be confirmed`

  const created = await one(
    `INSERT INTO serve.cases (dedupe_key, sponsor_id, accommodation_id, council, title, created_at)
     VALUES ($1, $2, $3, nullif($4, ''), $5, current_timestamp)
     RETURNING id`,
    [key, app.sponsor_id ?? 0, app.accommodation_id ?? 0, council ?? '', title]
  )
  for (const { kind } of CHECK_KINDS) {
    await run('INSERT INTO serve.checks (case_id, kind) VALUES ($1, $2)', [created.id, kind])
  }
  await run(
    `INSERT INTO serve.case_events (case_id, occurred_at, kind, description)
     VALUES ($1, current_timestamp, 'case_created', 'Case created from the first application for this sponsor and address')`,
    [created.id]
  )
  return created.id
}

function shortAddress (address) {
  return String(address).split(',')[0].trim()
}
