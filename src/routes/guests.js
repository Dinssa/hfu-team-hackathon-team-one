import { Router } from 'express'
import { all, one } from '../db.js'
import { VISA_STATUSES } from '../ingest/status.js'
import { listParam, textParam, selectedFilters, checkboxItems } from '../lib/filters.js'
import { councilOptions } from '../lib/lookups.js'

const router = Router()
const BASE = '/guests'

router.get(BASE, async (req, res, next) => {
  try {
    const status = listParam(req.query.status).filter(s => VISA_STATUSES.includes(s))
    const council = textParam(req.query.council)
    const q = textParam(req.query.q)
    const current = { status, council, q }

    const where = []
    const params = []
    if (status.length) {
      const placeholders = status.map(s => { params.push(s); return `$${params.length}` })
      where.push(`a.visa_status IN (${placeholders.join(', ')})`)
    }
    if (council) {
      params.push(council)
      where.push(`coalesce(acc.council, s.council) = $${params.length}`)
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`)
      const p = `$${params.length}`
      where.push(`(lower(coalesce(g.given_name, '') || ' ' || coalesce(g.family_name, '')) LIKE ${p}
                   OR lower(coalesce(g.passport_number, '')) LIKE ${p}
                   OR lower(coalesce(a.uan, '')) LIKE ${p}
                   OR lower(coalesce(a.gwf, '')) LIKE ${p})`)
    }

    const guests = await all(
      `SELECT g.id, g.given_name, g.family_name, g.date_of_birth, g.is_lead, g.relationship, g.arrived_at,
              a.id AS application_id, a.uan, a.visa_status,
              s.id AS sponsor_id, s.given_name AS sponsor_given_name, s.family_name AS sponsor_family_name,
              coalesce(acc.council, s.council) AS council
       FROM serve.guests g
       JOIN serve.applications a ON a.id = g.application_id
       LEFT JOIN serve.sponsors s ON s.id = a.sponsor_id
       LEFT JOIN serve.accommodations acc ON acc.id = a.accommodation_id
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY g.family_name, g.given_name, g.id`,
      params
    )

    res.render('guests/index.njk', {
      pageTitle: 'Guests',
      guests,
      filters: [
        { type: 'text', name: 'q', label: 'Name or reference', hint: 'Guest name, passport, UAN or GWF', value: q },
        { type: 'checkboxes', name: 'status', legend: 'Visa status', items: checkboxItems(VISA_STATUSES, status) },
        { type: 'select', name: 'council', label: 'Local authority', value: council, options: await councilOptions(), emptyText: 'All local authorities', autocomplete: true }
      ],
      selectedFilters: selectedFilters(BASE, current, [
        { name: 'q', heading: 'Name or reference' },
        { name: 'status', heading: 'Visa status' },
        { name: 'council', heading: 'Local authority' }
      ]),
      filtered: where.length > 0
    })
  } catch (err) {
    next(err)
  }
})

const SECTIONS = ['details', 'links', 'household']

router.get([`${BASE}/:id`, `${BASE}/:id/:section`], async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!req.params.section) return res.redirect(`${BASE}/${id}/details`)
    const section = req.params.section
    if (!SECTIONS.includes(section)) return next()
    const guest = await one(
      `SELECT g.*, a.uan, a.gwf, a.visa_status, a.event_datetime, a.case_id,
              s.id AS sponsor_id, s.given_name AS sponsor_given_name, s.family_name AS sponsor_family_name,
              acc.id AS accommodation_id, acc.address AS accommodation_address, acc.postcode AS accommodation_postcode,
              coalesce(acc.council, s.council) AS council
       FROM serve.guests g
       JOIN serve.applications a ON a.id = g.application_id
       LEFT JOIN serve.sponsors s ON s.id = a.sponsor_id
       LEFT JOIN serve.accommodations acc ON acc.id = a.accommodation_id
       WHERE g.id = $1`,
      [id]
    )
    if (!guest) return next()

    const household = await all(
      `SELECT id, given_name, family_name, date_of_birth, is_lead, relationship
       FROM serve.guests WHERE application_id = $1 AND id <> $2 ORDER BY is_lead DESC, id`,
      [guest.application_id, id]
    )

    res.render('guests/show.njk', {
      section, pageTitle: `Guest ${guest.uan ?? guest.id}`, guest, household })
  } catch (err) {
    next(err)
  }
})

export default router
