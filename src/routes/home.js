import { Router } from 'express'
import { all, one } from '../db.js'
import { ingestState } from '../ingest/index.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const files = await all(
      `SELECT file_name, file_type, processed_at, row_count, created_count, skipped_count, rejected_count
       FROM raw.ingested_files ORDER BY file_name`
    )
    const ingest = await ingestState()
    const counts = await one(
      `SELECT (SELECT count(*)::INTEGER FROM serve.applications) AS applications,
              (SELECT count(*)::INTEGER FROM serve.guests) AS guests,
              (SELECT count(*)::INTEGER FROM serve.sponsors) AS sponsors,
              (SELECT count(*)::INTEGER FROM serve.accommodations) AS accommodations,
              (SELECT count(*)::INTEGER FROM raw.rejected_rows) AS rejected`
    )
    res.render('home/index.njk', { pageTitle: 'Home', files, ingest, counts })
  } catch (err) {
    next(err)
  }
})

export default router
