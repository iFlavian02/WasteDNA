/**
 * Presentation data for the personal account: surplus deals near the user
 * (demo only, no API calls yet). Prices in EUR, distances in km.
 */

export const DEALS = [
  { id: 'd1', place: 'Hotel Luc Berlin', area: 'Mitte', item: 'Breakfast buffet box', category: 'Breakfast', originalEur: 14, priceEur: 4.9, distanceKm: 0.6, pickup: 'Today 10:30–11:30', left: 4 },
  { id: 'd2', place: 'Bäckerei Sonnenkorn', area: 'Prenzlauer Berg', item: 'Bread and pastry bag', category: 'Bakery', originalEur: 9.5, priceEur: 2.9, distanceKm: 1.4, pickup: 'Today 18:00–19:00', left: 6 },
  { id: 'd3', place: 'Kiez Kitchen', area: 'Kreuzberg', item: 'Vegetable curry, 2 portions', category: 'Hot meal', originalEur: 16, priceEur: 6.5, distanceKm: 2.1, pickup: 'Today 20:30–21:15', left: 3 },
  { id: 'd4', place: 'Grünhof Bistro', area: 'Mitte', item: 'Salad bowl and soup', category: 'Lunch', originalEur: 12.5, priceEur: 4.2, distanceKm: 0.9, pickup: 'Today 14:30–15:30', left: 5 },
  { id: 'd5', place: 'Spree Deli', area: 'Friedrichshain', item: 'Sandwich trio', category: 'Snacks', originalEur: 10.8, priceEur: 3.5, distanceKm: 2.8, pickup: 'Today 19:30–20:30', left: 8 },
  { id: 'd6', place: 'Markthalle Stand 12', area: 'Kreuzberg', item: 'Fruit and vegetable crate', category: 'Groceries', originalEur: 15, priceEur: 5, distanceKm: 3.4, pickup: 'Tomorrow 09:00–10:00', left: 2 },
]

/** Whole-percent discount of a deal, e.g. 65 for €14 → €4.90. */
export const discountPct = deal => Math.round((1 - deal.priceEur / deal.originalEur) * 100)

export const SORTS = { nearest: 'Nearest', cheapest: 'Cheapest', discount: 'Biggest discount' }

const COMPARE = {
  nearest: (a, b) => a.distanceKm - b.distanceKm,
  cheapest: (a, b) => a.priceEur - b.priceEur,
  discount: (a, b) => discountPct(b) - discountPct(a),
}

/** A sorted copy (the source list is never changed); ties keep the original order. */
export function sortDeals(deals, sort) {
  return [...deals].sort(COMPARE[sort] || COMPARE.nearest)
}

/** The cheapest `count` deals at or under `maxEur`, cheapest first. */
export function cheapDeals(deals, maxEur = 5, count = 3) {
  return sortDeals(deals.filter(deal => deal.priceEur <= maxEur), 'cheapest').slice(0, count)
}

const euro = new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' })
export const formatEur = value => euro.format(value)
