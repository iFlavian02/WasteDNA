/**
 * Redistribution endpoints on top of member 1's shared `api.request`, which
 * attaches `X-Demo-Session-Id` and throws `ApiError`. Paths and bodies follow
 * docs/API.md and docs/fixtures/redistribution/README.md.
 */

const BASE = '/api/redistribution'
const id = value => encodeURIComponent(value)

function query(params) {
  const search = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''))
  const text = search.toString()
  return text ? `?${text}` : ''
}

export function redistributionApi(api) {
  const get = path => api.request(`${BASE}${path}`)
  const post = (path, body) => api.request(`${BASE}${path}`, { method: 'POST', body })
  return {
    donors: () => get('/donors'),
    organizations: () => get('/organizations'),
    offers: (filters = {}) => get(`/offers${query(filters)}`),
    offer: offerId => get(`/offers/${id(offerId)}`),
    createOffer: payload => post('/offers', payload),
    matches: offerId => get(`/offers/${id(offerId)}/matches`),
    reserve: (offerId, body) => post(`/offers/${id(offerId)}/reservations`, body),
    cancelOffer: offerId => post(`/offers/${id(offerId)}/cancel`),
    reservations: (status) => get(`/reservations${query({ status })}`),
    release: reservationId => post(`/reservations/${id(reservationId)}/release`),
    handover: (reservationId, body) => post(`/reservations/${id(reservationId)}/handover`, body),
    planRoute: body => post('/routes/plan', body),
    impact: (period = {}) => get(`/impact${query(period)}`),
    surplusLog: donorId => get(`/surplus-log${query({ donor_id: donorId })}`),
    logSurplus: body => post('/surplus-log', body),
    forecasts: (days = 7) => get(`/forecasts${query({ days })}`),
  }
}
