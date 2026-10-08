import { Router } from 'express'
import { ingestNextFile } from '../ingest/index.js'

const router = Router()

router.post('/ingest/next', async (req, res) => {
  try {
    const result = await ingestNextFile()
    req.session.flash = {
      type: result.fileName ? 'success' : undefined,
      title: result.fileName ? 'File processed' : 'Nothing to process',
      html: `<p class="govuk-notification-banner__heading">${escape(result.message)}</p>`
    }
  } catch (err) {
    req.session.flash = {
      type: undefined,
      title: 'The file could not be processed',
      html: `<p class="govuk-notification-banner__heading">${escape(err.message)}</p>`
    }
  }
  res.redirect('/')
})

function escape (s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

export default router
