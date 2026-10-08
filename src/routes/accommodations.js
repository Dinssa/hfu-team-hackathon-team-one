import { Router } from 'express'
import { all, one } from '../db.js'
import { textParam, selectedFilters } from '../lib/filters.js'
import { councilOptions } from '../lib/lookups.js'

const router = Router()
const BASE = '/accommodations'

router.get(BASE, async (req, res, next) => {
  try {
    const council = textParam(req.query.council)
    const q = textParam(req.query.q)
    const current = { council, q }

    const where = []
    const params = []
    if (council) {
      params.push(council)
      where.push(`acc.council = $${params.length}`)
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`)
      const p = `$${params.length}`
      where.push(`(lower(coalesce(acc.address, '')) LIKE ${p} OR lower(coalesce(acc.postcode, '')) LIKE ${p})`)
    }

    const accommodations = await all(
      `SELECT acc.id, acc.address, acc.postcode, acc.council,
              (SELECT count(DISTINCT a.sponsor_id)::INTEGER FROM serve.applications a WHERE a.accommodation_id = acc.id) AS sponsors,
              (SELECT count(*)::INTEGER FROM serve.guests g JOIN serve.applications a ON a.id = g.application_id WHERE a.accommodation_id = acc.id) AS guests
       FROM serve.accommodations acc
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY acc.council NULLS LAST, acc.address, acc.id`,
      params
    )

    res.render('accommodations/index.njk', {
      pageTitle: 'Accommodation',
      accommodations,
      filters: [
        { type: 'text', name: 'q', label: 'Address or postcode', value: q },
        { type: 'select', name: 'council', label: 'Local authority', value: council, options: await councilOptions(), emptyText: 'All local authorities', autocomplete: true }
      ],
      selectedFilters: selectedFilters(BASE, current, [
        { name: 'q', heading: 'Address or postcode' },
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
    const accommodation = await one('SELECT * FROM serve.accommodations WHERE id = $1', [id])
    if (!accommodation) return next()

    const sponsors = await all(
      `SELECT DISTINCT s.id, s.given_name, s.family_name, s.postcode, s.council
       FROM serve.sponsors s JOIN serve.applications a ON a.sponsor_id = s.id
       WHERE a.accommodation_id = $1 ORDER BY s.family_name, s.given_name`,
      [id]
    )
    const applications = await all(
      `SELECT a.id, a.uan, a.visa_status, a.event_datetime, a.case_id,
              g.given_name, g.family_name,
              s.id AS sponsor_id, s.given_name AS sponsor_given_name, s.family_name AS sponsor_family_name,
              (SELECT count(*)::INTEGER FROM serve.guests x WHERE x.application_id = a.id) AS people
       FROM serve.applications a
       LEFT JOIN serve.guests g ON g.application_id = a.id AND g.is_lead
       LEFT JOIN serve.sponsors s ON s.id = a.sponsor_id
       WHERE a.accommodation_id = $1 ORDER BY a.event_datetime, a.id`,
      [id]
    )
    const guests = await all(
      `SELECT g.id, g.given_name, g.family_name, g.date_of_birth, g.relationship, g.arrived_at, a.id AS application_id, a.uan, a.visa_status
       FROM serve.guests g JOIN serve.applications a ON a.id = g.application_id
       WHERE a.accommodation_id = $1 ORDER BY a.id, g.is_lead DESC, g.id`,
      [id]
    )

    res.render('accommodations/show.njk', { pageTitle: `Accommodation ${accommodation.id}`, accommodation, sponsors, applications, guests })
  } catch (err) {
    next(err)
  }
})

export default router
