// Ingest one visa applications file (JSON array of UKVI submissions).
// Idempotent: a submission already stored is skipped, nothing is duplicated.
import { readFileSync } from 'node:fs'
import { run, all, one } from '../db.js'

// Question titles are fixed strings across every submission (DATA.md).
const Q = {
  givenName: 'Given name',
  familyName: 'Family name',
  dob: 'Date of birth',
  sex: 'Sex',
  nationality: 'Nationality',
  passport: 'Passport number',
  gwf: 'GWF number',
  email: 'Email address',
  telephone: 'Contact telephone number',
  relationship: 'Relationship to lead applicant',
  sponsorGivenName: 'Sponsor given name',
  sponsorFamilyName: 'Sponsor family name',
  sponsorDob: 'Sponsor date of birth',
  sponsorEmail: 'Sponsor email address',
  sponsorTelephone: 'Sponsor telephone number',
  sponsorAddress: 'Sponsor address',
  sponsorPostcode: 'Sponsor postcode',
  sponsorCouncil: 'Sponsor local authority',
  address: 'UK address where you will be staying',
  postcode: 'Postcode of UK address',
  council: 'Local authority of UK address',
  stayingWithSponsor: "Will you be staying at your sponsor's address?",
  hostGivenName: 'Host given name',
  hostFamilyName: 'Host family name'
}

export async function ingestApplicationsFile (filePath, fileName) {
  const submissions = JSON.parse(readFileSync(filePath, 'utf8'))
  if (!Array.isArray(submissions)) throw new Error(`${fileName} is not a JSON array of submissions`)

  const summary = { rows: submissions.length, created: 0, skipped: 0, rejected: 0 }

  await run('BEGIN TRANSACTION')
  try {
    for (const [index, submission] of submissions.entries()) {
      const outcome = await ingestSubmission(submission, fileName, index + 1)
      summary[outcome] += 1
    }
    // Re-running a file updates its ledger row rather than failing; the data rows were skipped above.
    await run(
      `INSERT INTO raw.ingested_files (file_name, file_type, processed_at, row_count, created_count, skipped_count, rejected_count)
       VALUES ($1, 'applications', current_timestamp, $2, $3, $4, $5)
       ON CONFLICT (file_name) DO UPDATE SET
         processed_at = excluded.processed_at, row_count = excluded.row_count, created_count = excluded.created_count,
         skipped_count = excluded.skipped_count, rejected_count = excluded.rejected_count`,
      [fileName, summary.rows, summary.created, summary.skipped, summary.rejected]
    )
    await run('COMMIT')
  } catch (err) {
    await run('ROLLBACK')
    throw err
  }
  return summary
}

// Returns 'created' | 'skipped' | 'rejected'
async function ingestSubmission (submission, fileName, rowNumber) {
  const guid = submission?.submissionGUID
  const persons = Array.isArray(submission?.person) ? submission.person : []
  const lead = persons.find(p => p.id === 1) ?? persons[0]

  if (!guid || !lead) {
    await reject(fileName, rowNumber, !guid ? 'Submission has no submissionGUID' : 'Submission has no people', submission)
    return 'rejected'
  }

  const existing = await one('SELECT id FROM serve.applications WHERE submission_guid = $1', [guid])
  if (existing) return 'skipped'

  await run(
    'INSERT INTO raw.submissions (submission_guid, file_name, payload) VALUES ($1, $2, $3::JSON) ON CONFLICT DO NOTHING',
    [guid, fileName, JSON.stringify(submission)]
  )

  const a = answersOf(lead)
  const sponsorId = await upsertSponsor(a)
  const accommodationId = await upsertAccommodation(a)

  const app = await one(
    `INSERT INTO serve.applications
       (submission_guid, uan, gwf, event_datetime, source_file, sponsor_id, accommodation_id,
        host_given_name, host_family_name, staying_with_sponsor)
     VALUES ($1, nullif($2,''), nullif($3,''), try_cast(nullif($4,'') AS TIMESTAMP), $5, $6, $7,
             nullif($8,''), nullif($9,''), nullif($10,''))
     RETURNING id`,
    [
      guid,
      text(submission.application?.uniqueApplicationNumber),
      a[Q.gwf] ?? '',
      text(submission.application?.eventDateTime),
      fileName,
      sponsorId,
      accommodationId,
      a[Q.hostGivenName] ?? '',
      a[Q.hostFamilyName] ?? '',
      a[Q.stayingWithSponsor] ?? ''
    ]
  )

  for (const person of persons) {
    const p = answersOf(person)
    await run(
      `INSERT INTO serve.guests
         (application_id, person_id, is_lead, given_name, family_name, date_of_birth, sex, nationality, passport_number, relationship)
       VALUES ($1, $2, $3, nullif($4,''), nullif($5,''), try_cast(nullif($6,'') AS DATE), nullif($7,''), nullif($8,''), nullif($9,''), nullif($10,''))`,
      [
        app.id,
        Number(person.id) || 0,
        person === lead,
        p[Q.givenName] ?? '',
        p[Q.familyName] ?? '',
        p[Q.dob] ?? '',
        p[Q.sex] ?? '',
        p[Q.nationality] ?? '',
        p[Q.passport] ?? '',
        p[Q.relationship] ?? (person === lead ? 'Lead applicant' : '')
      ]
    )
  }
  return 'created'
}

// Sponsors are identified by name and postcode. Same person on three applications = one row.
async function upsertSponsor (a) {
  const key = dedupeKey(a[Q.sponsorGivenName], a[Q.sponsorFamilyName], a[Q.sponsorPostcode])
  await run(
    `INSERT INTO serve.sponsors (dedupe_key, given_name, family_name, date_of_birth, email, telephone, address, postcode, council)
     VALUES ($1, nullif($2,''), nullif($3,''), nullif($4,''), nullif($5,''), nullif($6,''), nullif($7,''), nullif($8,''), nullif($9,''))
     ON CONFLICT DO NOTHING`,
    [key, a[Q.sponsorGivenName] ?? '', a[Q.sponsorFamilyName] ?? '', a[Q.sponsorDob] ?? '', a[Q.sponsorEmail] ?? '',
      a[Q.sponsorTelephone] ?? '', a[Q.sponsorAddress] ?? '', a[Q.sponsorPostcode] ?? '', a[Q.sponsorCouncil] ?? '']
  )
  return (await one('SELECT id FROM serve.sponsors WHERE dedupe_key = $1', [key])).id
}

// Accommodation is identified by its address. Council may be blank (file 08); that is M8's problem, not ingest's.
async function upsertAccommodation (a) {
  const key = dedupeKey(a[Q.address], a[Q.postcode])
  await run(
    `INSERT INTO serve.accommodations (dedupe_key, address, postcode, council)
     VALUES ($1, nullif($2,''), nullif($3,''), nullif($4,''))
     ON CONFLICT DO NOTHING`,
    [key, a[Q.address] ?? '', a[Q.postcode] ?? '', a[Q.council] ?? '']
  )
  return (await one('SELECT id FROM serve.accommodations WHERE dedupe_key = $1', [key])).id
}

async function reject (fileName, rowNumber, reason, raw) {
  await run(
    'INSERT INTO raw.rejected_rows (file_name, row_number, reason, raw_text) VALUES ($1, $2, $3, $4)',
    [fileName, rowNumber, reason, JSON.stringify(raw).slice(0, 2000)]
  )
}

// { "Given name": "Olena", ... } from a person's questions array.
function answersOf (person) {
  const out = {}
  for (const q of person?.questions ?? []) {
    if (q?.title) out[q.title] = text(q.answer)
  }
  return out
}

function dedupeKey (...parts) {
  return parts.map(p => text(p).trim().toLowerCase().replace(/\s+/g, ' ')).join('|')
}

function text (v) {
  return v === null || v === undefined ? '' : String(v)
}
