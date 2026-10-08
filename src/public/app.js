// Haven page scripts. Runs after GOV.UK Frontend, MOJ Frontend and
// accessible-autocomplete have loaded (this file is deferred).

// Selects marked data-module="app-autocomplete" become a type-ahead that keeps
// the original select for form submission. Label and id carry across.
function enhanceAutocompletes () {
  if (typeof window.accessibleAutocomplete === 'undefined') return
  const selects = document.querySelectorAll('select[data-module="app-autocomplete"]')
  for (const select of selects) {
    const selected = select.options[select.selectedIndex]
    window.accessibleAutocomplete.enhanceSelectElement({
      selectElement: select,
      defaultValue: selected && selected.value ? selected.text : '',
      placeholder: select.dataset.placeholder || 'Start typing or select one',
      autoselect: false,
      showAllValues: true,
      confirmOnBlur: false,
      preserveNullOptions: true,
      displayMenu: 'overlay',
      dropdownArrow: ({ className }) =>
        `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" focusable="false" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>`
    })
  }
}

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

enhanceAutocompletes()
trackSideNavigation()
