// Static service pages linked from the footer.
import { Router } from 'express'

const router = Router()

const PAGES = {
  help: {
    title: 'Help',
    paragraphs: [
      'This service helps councils and central teams manage households arriving under the Homes for Ukraine scheme.',
      'Applications, arrivals and offers of accommodation arrive as data files from upstream systems. Use "Process next file" on the home page to bring the next one in.',
      'Each case carries four safeguarding checks. The case status is worked out from those checks and updates whenever a check changes.'
    ]
  },
  cookies: {
    title: 'Cookies',
    paragraphs: [
      'This prototype sets one cookie, a session cookie, so that messages such as "File processed" can be shown to you after an action. It is deleted when you close your browser.',
      'No analytics or marketing cookies are set.'
    ]
  },
  accessibility: {
    title: 'Accessibility statement',
    paragraphs: [
      'This prototype is built with the GOV.UK Design System and MOJ Design System, which are tested against WCAG 2.2 AA.',
      'Every page has one main heading and a descriptive title. Every form control has a visible label. Status is always conveyed in words, never by colour alone. All actions can be reached and used with a keyboard.',
      'The service has not had a formal accessibility audit. It was built in a single hackathon session.'
    ]
  },
  privacy: {
    title: 'Privacy',
    paragraphs: [
      'Every person, address and record in this prototype is synthetic. No real people and no real cases appear anywhere in it.',
      'The service stores no information about you beyond a session cookie.'
    ]
  }
}

for (const [slug, page] of Object.entries(PAGES)) {
  router.get(`/${slug}`, (req, res) => {
    res.render('pages/static.njk', { pageTitle: page.title, page })
  })
}

export default router
