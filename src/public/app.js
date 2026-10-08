// Haven page scripts. Loaded after GOV.UK and MOJ Frontend have initialised.

// Side navigation built from in-page anchors: highlight the section in view.
function trackSideNavigation () {
  const nav = document.querySelector('.app-side-navigation')
  if (!nav || !('IntersectionObserver' in window)) return

  const links = Array.from(nav.querySelectorAll('a[href^="#"]'))
  const sections = links
    .map(link => document.getElementById(link.getAttribute('href').slice(1)))
    .filter(Boolean)
  if (sections.length === 0) return

  function activate (id) {
    for (const link of links) {
      const item = link.closest('.moj-side-navigation__item')
      const isActive = link.getAttribute('href') === `#${id}`
      item.classList.toggle('moj-side-navigation__item--active', isActive)
      if (isActive) link.setAttribute('aria-current', 'location')
      else link.removeAttribute('aria-current')
    }
  }

  const visible = new Map()
  const observer = new IntersectionObserver(entries => {
    for (const entry of entries) visible.set(entry.target.id, entry.isIntersecting)
    const first = sections.find(s => visible.get(s.id))
    if (first) activate(first.id)
  }, { rootMargin: '0px 0px -60% 0px' })

  sections.forEach(section => observer.observe(section))
  activate(sections[0].id)

  for (const link of links) {
    link.addEventListener('click', () => activate(link.getAttribute('href').slice(1)))
  }
}

trackSideNavigation()
