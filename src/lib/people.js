// Age helpers shared by cases, checks and views.

// Whole years between a date of birth and a reference date (today by default).
export function ageOn (dateOfBirth, on = new Date()) {
  if (!dateOfBirth) return null
  const dob = dateOfBirth instanceof Date ? dateOfBirth : new Date(dateOfBirth)
  if (Number.isNaN(dob.getTime())) return null
  let age = on.getUTCFullYear() - dob.getUTCFullYear()
  const beforeBirthday = on.getUTCMonth() < dob.getUTCMonth() ||
    (on.getUTCMonth() === dob.getUTCMonth() && on.getUTCDate() < dob.getUTCDate())
  if (beforeBirthday) age -= 1
  return age
}

// Youngest person in a list of guests, with their age, or null.
export function youngest (guests) {
  let best = null
  for (const g of guests) {
    const age = ageOn(g.date_of_birth)
    if (age === null) continue
    if (!best || age < best.age) best = { guest: g, age }
  }
  return best
}
