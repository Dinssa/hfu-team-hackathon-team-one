import express from 'express'
import nunjucks from 'nunjucks'
import session from 'express-session'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ensureSchema } from './db.js'
import { watchIncoming } from './ingest/watch.js'
import homeRoutes from './routes/home.js'
import ingestRoutes from './routes/ingest.js'
import applicationRoutes from './routes/applications.js'
import pageRoutes from './routes/pages.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(here, '..')
const govukDist = path.join(root, 'node_modules', 'govuk-frontend', 'dist')
const mojDist = path.join(root, 'node_modules', '@ministryofjustice', 'frontend')

const app = express()

// Templates: our views first, then govuk-frontend and moj-frontend so
// "govuk/..." and "moj/..." macro paths resolve.
const env = nunjucks.configure([path.join(here, 'views'), govukDist, mojDist], {
  autoescape: true,
  express: app,
  noCache: process.env.NODE_ENV !== 'production'
})
env.addFilter('date', (value, style = 'long') => formatDate(value, style))
app.set('view engine', 'njk')

// Service-wide template variables. Rename the service in one place.
app.locals.serviceName = 'Haven'
app.locals.serviceUrl = '/'
app.locals.assetPath = '/assets'

// Static assets. Fonts and images at /assets (GOV.UK first, MOJ icons fall through),
// GOV.UK CSS and JS at /govuk, MOJ CSS and JS at /moj.
app.use('/assets', express.static(path.join(govukDist, 'govuk', 'assets')))
app.use('/assets', express.static(path.join(mojDist, 'moj', 'assets')))
app.use('/govuk', express.static(path.join(govukDist, 'govuk')))
app.use('/moj', express.static(path.join(mojDist, 'moj')))
app.use('/autocomplete', express.static(path.join(root, 'node_modules', 'accessible-autocomplete', 'dist')))
app.use('/public', express.static(path.join(here, 'public')))

app.use(express.urlencoded({ extended: false }))
app.use(session({
  secret: 'hackathon-not-a-secret',
  resave: false,
  saveUninitialized: false
}))

// One-shot flash messages for "ingest done" style notifications.
app.use((req, res, next) => {
  res.locals.flash = req.session.flash ?? null
  delete req.session.flash
  res.locals.currentPath = req.path
  next()
})

app.use('/', homeRoutes)
app.use('/', ingestRoutes)
app.use('/', applicationRoutes)
app.use('/', pageRoutes)

app.use((req, res) => {
  res.status(404).render('error.njk', { pageTitle: 'Page not found', message: 'If you typed the web address, check it is correct.' })
})

app.use((err, req, res, next) => {
  console.error(err)
  res.status(500).render('error.njk', { pageTitle: 'Sorry, there is a problem with the service', message: err.message })
})

function formatDate (value, style) {
  if (!value) return ''
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  const opts = style === 'short'
    ? { day: 'numeric', month: 'short', year: 'numeric' }
    : { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }
  return new Intl.DateTimeFormat('en-GB', opts).format(d)
}

const port = process.env.PORT ?? 3000
await ensureSchema()
await watchIncoming()
app.listen(port, () => console.log(`Share rebuild listening on http://localhost:${port}`))
