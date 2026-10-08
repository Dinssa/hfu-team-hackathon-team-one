import { Router } from 'express'
import { all, one } from '../db.js'
import { VISA_STATUSES } from '../ingest/status.js'
import { listParam, textParam, selectedFilters, checkboxItems } from '../lib/filters.js'

const router = Router()
const BASE = '/applications'

router.get(BASE, async (req, res, next) => {
  try {
    const status = listParam(req.query.status).filter(s => VISA_STATUSES.includes(s))
    const council = textParam(req.query.council)
    const q = textParam(req.query.q)
    const current = { status, council, q }

    const councils = (await all(
      'SELECT DISTINCT council FROM serve.accommodations WHERE council IS NOT NULL ORDER BY council'
    )).map(r => r.council)

    const where = []
    const params = []
    if (status.length) {
      const placeholders = status.map(s => { params.push(s); return `$${params.length}` })
      where.push(`a.visa_status IN (${placeholders.join(', ')})`)
    }
    if (council) {
      params.push(council)
      where.push(`acc.council = $${params.length}`)
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`)
      const p = `$${params.length}`
      where.push(`(lower(g.given_name || ' ' || g.family_name) LIKE ${p}
                   OR lower(coalesce(a.uan, '')) LIKE ${p}
                   OR lower(coalesce(a.gwf, '')) LIKE ${p}
                   OR lower(coalesce(s.given_name, '') || ' ' || coalesce(s.family_name, '')) LIKE ${p})`)
    }

    const applications = await all(
      `SELECT a.id, a.uan, a.gwf, a.visa_status, a.event_datetime,
              g.given_name, g.family_name,
              s.given_name AS sponsor_given_name, s.family_name AS sponsor_family_name,
              acc.council,
              (SELECT count(*)::INTEGER FROM serve.guests x WHERE x.application_id = a.id) AS people
       FROM serve.applications a
       LEFT JOIN serve.guests g ON g.application_id = a.id AND g.is_lead
       LEFT JOIN serve.sponsors s ON s.id = a.sponsor_id
       LEFT JOIN serve.accommodations acc ON acc.id = a.accommodation_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY a.event_datetime, a.uan`,
      params
    )

    res.render('applications/index.njk', {
      pageTitle: 'Visa applications',
      applications,
      filters: [
        { type: 'text', name: 'q', label: 'Name or reference', hint: 'Applicant, sponsor, UAN or GWF', value: q },
        { type: 'checkboxes', name: 'status', legend: 'Visa status', items: checkboxItems(VISA_STATUSES, status) },
        { type: 'select', name: 'council', label: 'Council', value: council, options: councils, emptyText: 'All councils' }
      ],
      selectedFilters: selectedFilters(BASE, current, [
        { name: 'q', heading: 'Name or reference' },
        { name: 'status', heading: 'Visa status' },
        { name: 'council', heading: 'Council' }
      ]),
      filtered: where.length > 0
    })
  } catch (err) {
    next(err)
  }
})

router.get(`${BASE}/:id`, async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    const application = await one(
      `SELECT a.*, s.given_name AS sponsor_given_name, s.family_name AS sponsor_family_name,
              acc.address AS accommodation_address, acc.postcode AS accommodation_postcode, acc.council
       FROM serve.applications a
       LEFT JOIN serve.sponsors s ON s.id = a.sponsor_id
       LEFT JOIN serve.accommodations acc ON acc.id = a.accommodation_id
       WHERE a.id = $1`,
      [id]
    )
    if (!application) return next()

    const guests = await all('SELECT * FROM serve.guests WHERE application_id = $1 ORDER BY person_id', [id])
    const raw = await one('SELECT payload FROM raw.submissions WHERE submission_guid = $1', [application.submission_guid])
    const submission = raw ? JSON.parse(raw.payload) : null

    // Every answer on the submission, grouped by person, in the order they arrived.
    const people = (submission?.person ?? []).map(p => ({
      id: p.id,
      role: p.role,
      guest: guests.find(g => g.person_id === p.id) ?? null,
      answers: (p.questions ?? []).map(q => ({ key: q.title, value: q.answer ?? '' }))
    }))

    const lead = guests.find(g => g.is_lead) ?? guests[0]
    res.render('applications/show.njk', {
      pageTitle: `Application ${application.uan ?? application.submission_guid}`,
      application,
      lead,
      guests,
      people,
      submission
    })
  } catch (err) {
    next(err)
  }
})

export default router
