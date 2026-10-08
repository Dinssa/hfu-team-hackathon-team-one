// Helpers for MOJ-style filter panels on list pages.
// A route declares its filters, this turns the query string into SQL-ready
// values plus the "selected filters" tags with remove links.

// Query values arrive as a string, an array, or nothing. Always get an array.
export function listParam (value) {
  if (value === undefined || value === null || value === '') return []
  return (Array.isArray(value) ? value : [value]).map(v => String(v).trim()).filter(Boolean)
}

export function textParam (value) {
  return value === undefined || value === null ? '' : String(value).trim()
}

// Build a query string from the current filters with one value removed.
export function hrefWithout (basePath, current, name, value) {
  const params = new URLSearchParams()
  for (const [key, values] of Object.entries(current)) {
    for (const v of listParam(values)) {
      if (key === name && v === value) continue
      params.append(key, v)
    }
  }
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

// Shape the mojFilter "selectedFilters" block. `definitions` is
// [{ name, heading, label?: fn(value) }], `current` is { name: values }.
export function selectedFilters (basePath, current, definitions) {
  const categories = definitions
    .map(def => ({
      heading: { text: def.heading },
      items: listParam(current[def.name]).map(value => ({
        text: def.label ? def.label(value) : value,
        href: hrefWithout(basePath, current, def.name, value)
      }))
    }))
    .filter(c => c.items.length > 0)

  if (categories.length === 0) return null
  return {
    heading: { text: 'Selected filters' },
    clearLink: { text: 'Clear filters', href: basePath },
    categories
  }
}

// Checkbox items for govukCheckboxes with the right ones ticked.
export function checkboxItems (values, selected, labels = {}) {
  return values.map(v => ({ value: v, text: labels[v] ?? v, checked: selected.includes(v) }))
}
