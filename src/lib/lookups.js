// Small shared lookups for filters and forms.
import { all } from '../db.js'

// Every local authority we have seen, from accommodations and sponsors.
export async function councilOptions () {
  const rows = await all(
    `SELECT council FROM (
       SELECT DISTINCT council FROM serve.accommodations WHERE council IS NOT NULL
       UNION
       SELECT DISTINCT council FROM serve.sponsors WHERE council IS NOT NULL
     ) ORDER BY council`
  )
  return rows.map(r => r.council)
}
