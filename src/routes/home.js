import { Router } from 'express'
import { all } from '../db.js'

const router = Router()

router.get('/', async (req, res, next) => {
  try {
    const files = await all('SELECT file_name, file_type, processed_at, row_count, created_count, skipped_count, rejected_count FROM raw.ingested_files ORDER BY file_name')
    res.render('home/index.njk', { pageTitle: 'Home', files })
  } catch (err) {
    next(err)
  }
})

export default router
