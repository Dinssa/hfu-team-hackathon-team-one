import { Router } from 'express'
import { all, one } from '../db.js'
import { listParam, textParam, selectedFilters, checkboxItems } from '../lib/filters.js'
import { councilOptions } from '../lib/lookups.js'
import { ageOn, youngest } from '../lib/people.js'
import { CHECK_KINDS } from '../cases/form.js'

const router = Router()
const BASE = '/cases'

export const CASE_STATUSES = [
  'Checks Required', 'Checks Partially Completed', 'Pre-arrival Checks Complete', 'Checks Completed', 'Some Checks Failed'
]

router.get(BASE, async (req, res, next) => {
  try {
    const status = listParam(req.query.status).filter(s => CASE_STATUSES.includes(s))
    const council = textParam(req.query.council)
    const q = textParam(req.query.q)
    const current = { status, council, q }

    const where = []
    const params = []
    if (status.length) {
      const placeholders = status.map(s => { params.push(s); return `$${params.length}` })
      where.push(`c.checks_status IN (${placeholders.join(', ')})`)
    }
    if (council) {
      params.push(council)
      where.push(`c.council = $${params.length}`)
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`)
      const p = `$${params.length}`
      where.push(`(lower(c.title) LIKE ${p}
                   OR lower(coalesce(s.given_name, '') || ' ' || coalesce(s.family_name, '')) LIKE ${p}
                   OR lower(coalesce(acc.address, '')) LIKE ${p}
                   OR lower(coalesce(acc.postcode, '')) LIKE ${p}
                   OR EXISTS (SELECT 1 FROM serve.applications a JOIN serve.guests g ON g.application_id = a.id
                              WHERE a.case_id = c.id AND (lower(coalesce(g.given_name, '') || ' ' || coalesce(g.family_name, '')) LIKE ${p}
                                                          OR lower(coalesce(a.uan, '')) LIKE ${p})))`)
    }

    const cases = await all(
      `SELECT c.id, c.title, c.council, c.checks_status, c.created_at,
              s.id AS sponsor_id, s.given_name AS sponsor_given_name, s.family_name AS sponsor_family_name,
              (SELECT count(*)::INTEGER FROM serve.applications a WHERE a.case_id = c.id) AS applications,
              (SELECT count(*)::INTEGER FROM serve.guests g JOIN serve.applications a ON a.id = g.application_id WHERE a.case_id = c.id) AS people
       FROM serve.cases c
       LEFT JOIN serve.sponsors s ON s.id = c.sponsor_id
       LEFT JOIN serve.accommodations acc ON acc.id = c.accommodation_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY c.created_at DESC, c.id DESC`,
      params
    )

    res.render('cases/index.njk', {
      pageTitle: 'Cases',
      cases,
      filters: [
        { type: 'text', name: 'q', label: 'Name, address or reference', value: q },
        { type: 'checkboxes', name: 'status', legend: 'Checks status', items: checkboxItems(CASE_STATUSES, status) },
        { type: 'select', name: 'council', label: 'Local authority', value: council, options: await councilOptions(), emptyText: 'All local authorities', autocomplete: true }
      ],
      selectedFilters: selectedFilters(BASE, current, [
        { name: 'q', heading: 'Name, address or reference' },
        { name: 'status', heading: 'Checks status' },
        { name: 'council', heading: 'Local authority' }
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
    const kase = await one(
      `SELECT c.*, s.given_name AS sponsor_given_name, s.family_name AS sponsor_family_name, s.email AS sponsor_email,
              s.telephone AS sponsor_telephone, s.postcode AS sponsor_postcode,
              acc.address AS accommodation_address, acc.postcode AS accommodation_postcode
       FROM serve.cases c
       LEFT JOIN serve.sponsors s ON s.id = c.sponsor_id
       LEFT JOIN serve.accommodations acc ON acc.id = c.accommodation_id
       WHERE c.id = $1`,
      [id]
    )
    if (!kase) return next()

    const applications = await all(
      `SELECT a.id, a.uan, a.gwf, a.visa_status, a.event_datetime,
              g.given_name, g.family_name,
              (SELECT count(*)::INTEGER FROM serve.guests x WHERE x.application_id = a.id) AS people
       FROM serve.applications a LEFT JOIN serve.guests g ON g.application_id = a.id AND g.is_lead
       WHERE a.case_id = $1 ORDER BY a.event_datetime, a.id`,
      [id]
    )
    const guests = (await all(
      `SELECT g.*, a.uan, a.visa_status FROM serve.guests g JOIN serve.applications a ON a.id = g.application_id
       WHERE a.case_id = $1 ORDER BY a.id, g.is_lead DESC, g.id`,
      [id]
    )).map(g => ({ ...g, age: ageOn(g.date_of_birth) }))
    const checks = (await all('SELECT * FROM serve.checks WHERE case_id = $1 ORDER BY kind', [id]))
      .map(c => ({ ...c, name: CHECK_KINDS.find(k => k.kind === c.kind)?.name ?? `Check ${c.kind}` }))
    const events = await all('SELECT * FROM serve.case_events WHERE case_id = $1 ORDER BY occurred_at DESC, id DESC', [id])

    res.render('cases/show.njk', {
      pageTitle: `Case ${kase.id}`,
      kase,
      applications,
      guests,
      youngest: youngest(guests),
      checks,
      events
    })
  } catch (err) {
    next(err)
  }
})

export default router
