// Ingest one visa application file. A file holds a single { record } or an array of them.
// Idempotent: a record already stored is skipped, nothing is duplicated.
import { readFileSync } from 'node:fs'
import { run, one } from '../db.js'

// Answers are keyed "Section::Prompt" because prompts such as "Family name" repeat across sections.
const Q = {
  givenName: 'Your name::Given name(s)',
  familyName: 'Your name::name.surname',
  dob: 'Your nationality, country and date of birth::Date of birth',
  sex: 'Your sex::What is your sex, as shown in your passport or travel document?',
  passport: 'Your passport::Passport number or travel document reference number',
  gwf: 'GWF Number::GWF Number',
  sponsorGivenName: 'Your sponsor::Given name(s)',
  sponsorFamilyName: 'Your sponsor::Family name',
  sponsorAddress: "Provide your sponsor's residential address::Address",
  sponsorCouncil: "Provide your sponsor's residential address::Local authority",
  stayingWithSponsor: 'Your address in the UK::Will you be staying at the residential address of your sponsor?',
  familyMember: {
    relationship: "About your family member::What is this person's relationship to you?",
    givenName: 'About your family member::Given names',
    familyName: 'About your family member::Family name',
    dob: 'About your family member::Date of birth',
    nationality: 'About your family member::Country of nationality',
    passport: 'About your family member::Passport number'
  }
}

// Sponsor sections are titled with the sponsor's own name, e.g. "Jane Smith's telephone number and email".
const SPONSOR_SUFFIX = {
  dob: "'s date of birth?",
  email: "'s email address",
  telephone: "'s telephone number"
}

const UK_POSTCODE = /([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\s*$/i

export async function ingestApplicationsFile (filePath, fileName) {
  const parsed = JSON.parse(readFileSync(filePath, 'utf8'))
  const records = (Array.isArray(parsed) ? parsed : [parsed]).map(r => r?.record ?? r)

  const summary = { rows: records.length, created: 0, skipped: 0, rejected: 0 }

  await run('BEGIN TRANSACTION')
  try {
    for (const [index, record] of records.entries()) {
      const outcome = await ingestRecord(record, fileName, index + 1)
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
async function ingestRecord (record, fileName, rowNumber) {
  const guid = record?.id
  const people = Array.isArray(record?.people) ? record.people : []
  const lead = people.find(p => hasRole(p, r => r.kind === 'lead_applicant')) ?? people[0]
  const sponsor = people.find(p => hasRole(p, r => r.relationship === 'sponsor'))

  if (!guid || !lead) {
    await reject(fileName, rowNumber, !guid ? 'Record has no id' : 'Record has no people', record)
    return 'rejected'
  }

  const existing = await one('SELECT id FROM serve.applications WHERE submission_guid = $1', [guid])
  if (existing) return 'skipped'

  await run(
    'INSERT INTO raw.submissions (submission_guid, file_name, payload) VALUES ($1, $2, $3::JSON) ON CONFLICT DO NOTHING',
    [guid, fileName, JSON.stringify(record)]
  )

  const a = answersOf(lead)
  const s = answersOf(sponsor)
  const sponsorAddress = a[Q.sponsorAddress] ?? ''
  const sponsorPostcode = postcodeOf(sponsorAddress)
  const sponsorCouncil = a[Q.sponsorCouncil] ?? ''

  const sponsorId = await upsertSponsor({
    givenName: s[Q.sponsorGivenName] ?? '',
    familyName: s[Q.sponsorFamilyName] ?? '',
    dob: bySuffix(s, SPONSOR_SUFFIX.dob),
    email: bySuffix(s, SPONSOR_SUFFIX.email),
    telephone: bySuffix(s, SPONSOR_SUFFIX.telephone),
    address: sponsorAddress,
    postcode: sponsorPostcode,
    council: sponsorCouncil
  })

  // The feed only gives an address for the sponsor. Guests staying elsewhere have no accommodation yet.
  const stayingWithSponsor = a[Q.stayingWithSponsor] ?? ''
  const accommodationId = stayingWithSponsor === 'Yes' && sponsorAddress
    ? await upsertAccommodation(sponsorAddress, sponsorPostcode, sponsorCouncil)
    : null

  const app = await one(
    `INSERT INTO serve.applications
       (submission_guid, uan, gwf, event_datetime, source_file, sponsor_id, accommodation_id, staying_with_sponsor)
     VALUES ($1, nullif($2,''), nullif($3,''), try_cast(nullif($4,'') AS TIMESTAMP), $5, $6, $7, nullif($8,''))
     RETURNING id`,
    [
      guid,
      text(record.event?.application_ref),
      a[Q.gwf] ?? '',
      text(record.event?.occurred_at),
      fileName,
      sponsorId,
      accommodationId,
      stayingWithSponsor
    ]
  )

  await insertGuest(app.id, Number(lead.index) || 0, true, {
    givenName: a[Q.givenName],
    familyName: a[Q.familyName],
    dob: a[Q.dob],
    sex: a[Q.sex],
    passport: a[Q.passport],
    relationship: 'Lead applicant'
  })

  // A family member named on the lead's answers is stored as a second guest on the same application.
  const fm = Q.familyMember
  if (a[fm.givenName] || a[fm.familyName]) {
    await insertGuest(app.id, people.length, false, {
      givenName: a[fm.givenName],
      familyName: a[fm.familyName],
      dob: a[fm.dob],
      nationality: a[fm.nationality],
      passport: a[fm.passport],
      relationship: a[fm.relationship]
    })
  }
  return 'created'
}

async function insertGuest (applicationId, personId, isLead, g) {
  await run(
    `INSERT INTO serve.guests
       (application_id, person_id, is_lead, given_name, family_name, date_of_birth, sex, nationality, passport_number, relationship)
     VALUES ($1, $2, $3, nullif($4,''), nullif($5,''), try_cast(nullif($6,'') AS DATE), nullif($7,''), nullif($8,''), nullif($9,''), nullif($10,''))`,
    [applicationId, personId, isLead, g.givenName ?? '', g.familyName ?? '', g.dob ?? '', g.sex ?? '',
      g.nationality ?? '', g.passport ?? '', g.relationship ?? '']
  )
}

// Sponsors are identified by name and postcode. Same person on three applications = one row.
async function upsertSponsor (sp) {
  const key = dedupeKey(sp.givenName, sp.familyName, sp.postcode)
  await run(
    `INSERT INTO serve.sponsors (dedupe_key, given_name, family_name, date_of_birth, email, telephone, address, postcode, council)
     VALUES ($1, nullif($2,''), nullif($3,''), nullif($4,''), nullif($5,''), nullif($6,''), nullif($7,''), nullif($8,''), nullif($9,''))
     ON CONFLICT DO NOTHING`,
    [key, sp.givenName, sp.familyName, sp.dob, sp.email, sp.telephone, sp.address, sp.postcode, sp.council]
  )
  return (await one('SELECT id FROM serve.sponsors WHERE dedupe_key = $1', [key])).id
}

// Accommodation is identified by its address.
async function upsertAccommodation (address, postcode, council) {
  const key = dedupeKey(address, postcode)
  await run(
    `INSERT INTO serve.accommodations (dedupe_key, address, postcode, council)
     VALUES ($1, nullif($2,''), nullif($3,''), nullif($4,''))
     ON CONFLICT DO NOTHING`,
    [key, address, postcode, council]
  )
  return (await one('SELECT id FROM serve.accommodations WHERE dedupe_key = $1', [key])).id
}

async function reject (fileName, rowNumber, reason, raw) {
  await run(
    'INSERT INTO raw.rejected_rows (file_name, row_number, reason, raw_text) VALUES ($1, $2, $3, $4)',
    [fileName, rowNumber, reason, JSON.stringify(raw).slice(0, 2000)]
  )
}

function hasRole (person, test) {
  return (person?.roles ?? []).some(test)
}

// { "Your name::Given name(s)": "Olena", ... } from a person's responses. First answer wins.
function answersOf (person) {
  const out = {}
  for (const r of person?.responses ?? []) {
    const key = `${r?.section ?? ''}::${r?.prompt ?? ''}`
    if (!(key in out)) out[key] = valuesText(r?.values)
  }
  return out
}

function bySuffix (answers, suffix) {
  const key = Object.keys(answers).find(k => k.endsWith(suffix))
  return key ? answers[key] : ''
}

function postcodeOf (address) {
  const m = text(address).match(UK_POSTCODE)
  return m ? m[1].toUpperCase() : ''
}

export function valuesText (values) {
  return Array.isArray(values) ? values.map(text).filter(Boolean).join(', ') : text(values)
}

function dedupeKey (...parts) {
  return parts.map(p => text(p).trim().toLowerCase().replace(/\s+/g, ' ')).join('|')
}

function text (v) {
  return v === null || v === undefined ? '' : String(v)
}
