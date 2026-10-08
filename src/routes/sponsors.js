import { Router } from 'express'
import { all, one } from '../db.js'
import { textParam, selectedFilters } from '../lib/filters.js'
import { councilOptions } from '../lib/lookups.js'

const router = Router()
const BASE = '/sponsors'

router.get(BASE, async (req, res, next) => {
  try {
    const council = textParam(req.query.council)
    const q = textParam(req.query.q)
    const current = { council, q }

    const where = []
    const params = []
    if (council) {
      params.push(council)
      where.push(`s.council = $${params.length}`)
    }
    if (q) {
      params.push(`%${q.toLowerCase()}%`)
      const p = `$${params.length}`
      where.push(`(lower(coalesce(s.given_name, '') || ' ' || coalesce(s.family_name, '')) LIKE ${p}
                   OR lower(coalesce(s.postcode, '')) LIKE ${p}
                   OR lower(coalesce(s.address, '')) LIKE ${p}
                   OR lower(coalesce(s.email, '')) LIKE ${p})`)
    }

    const sponsors = await all(
      `SELECT s.id, s.given_name, s.family_name, s.postcode, s.council,
              (SELECT count(*)::INTEGER FROM serve.applications a WHERE a.sponsor_id = s.id) AS applications,
              (SELECT count(*)::INTEGER FROM serve.guests g JOIN serve.applications a ON a.id = g.application_id WHERE a.sponsor_id = s.id) AS guests
       FROM serve.sponsors s
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY s.family_name, s.given_name, s.id`,
      params
    )

    res.render('sponsors/index.njk', {
      pageTitle: 'Sponsors',
      sponsors,
      filters: [
        { type: 'text', name: 'q', label: 'Name, postcode or email', value: q },
        { type: 'select', name: 'council', label: 'Local authority', value: council, options: await councilOptions(), emptyText: 'All local authorities', autocomplete: true }
      ],
      selectedFilters: selectedFilters(BASE, current, [
        { name: 'q', heading: 'Name, postcode or email' },
        { name: 'council', heading: 'Local authority' }
      ]),
      filtered: where.length > 0
    })
  } catch (err) {
    next(err)
  }
})

const SECTIONS = ['details', 'accommodation', 'applications', 'guests']

router.get([`${BASE}/:id`, `${BASE}/:id/:section`], async (req, res, next) => {
  try {
    const id = Number(req.params.id)
    if (!req.params.section) return res.redirect(`${BASE}/${id}/details`)
    const section = req.params.section
    if (!SECTIONS.includes(section)) return next()
    const sponsor = await one('SELECT * FROM serve.sponsors WHERE id = $1', [id])
    if (!sponsor) return next()

    const applications = await all(
      `SELECT a.id, a.uan, a.visa_status, a.event_datetime, a.case_id,
              g.given_name, g.family_name,
              (SELECT count(*)::INTEGER FROM serve.guests x WHERE x.application_id = a.id) AS people
       FROM serve.applications a
       LEFT JOIN serve.guests g ON g.application_id = a.id AND g.is_lead
       WHERE a.sponsor_id = $1 ORDER BY a.event_datetime, a.id`,
      [id]
    )
    const guests = await all(
      `SELECT g.id, g.given_name, g.family_name, g.date_of_birth, g.relationship, g.arrived_at, a.id AS application_id, a.uan, a.visa_status
       FROM serve.guests g JOIN serve.applications a ON a.id = g.application_id
       WHERE a.sponsor_id = $1 ORDER BY a.id, g.is_lead DESC, g.id`,
      [id]
    )
    const accommodations = await all(
      `SELECT DISTINCT acc.id, acc.address, acc.postcode, acc.council
       FROM serve.accommodations acc JOIN serve.applications a ON a.accommodation_id = acc.id
       WHERE a.sponsor_id = $1 ORDER BY acc.address`,
      [id]
    )

    res.render('sponsors/show.njk', {
      section, pageTitle: `Sponsor ${sponsor.id}`, sponsor, applications, guests, accommodations })
  } catch (err) {
    next(err)
  }
})

export default router
