// Visa status rules from DATA.md. Pure functions, no database access.

export const VISA_STATUSES = ['Pending', 'Issued', 'Arrived', 'Withdrawn', 'Refused', 'Confirmed']

// Higher wins when updates conflict.
const VISA_PRECEDENCE = { Arrived: 5, Issued: 4, Withdrawn: 3, Refused: 2, Confirmed: 1 }

// One arrivals row -> the status it implies on its own.
export function statusFromUpdate ({ decision, arrivalDatetime }) {
  const d = (decision ?? '').trim()
  if (d === 'Issued' || d === 'GRANT') return arrivalDatetime ? 'Arrived' : 'Issued'
  if (d === 'Withdrawn') return 'Withdrawn'
  if (d === 'Refused') return 'Refused'
  return 'Confirmed' // Voided and anything unrecognised
}

// All updates for one application -> the status the service shows.
export function deriveVisaStatus (updates) {
  if (!updates || updates.length === 0) return 'Pending'
  return updates
    .map(statusFromUpdate)
    .reduce((best, s) => (VISA_PRECEDENCE[s] > VISA_PRECEDENCE[best] ? s : best))
}
