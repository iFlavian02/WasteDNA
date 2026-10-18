import { Map, ShoppingBag } from 'lucide-react'
import { EmptyState } from '../../components/States.jsx'
import { PageHeader } from '../../components/ui.jsx'

/**
 * Customer pages, mounted at `/map/*` and `/my-pickups` with `{ api,
 * sessionId }`. Placeholders until plan step 5 (docs/UI_PLAN.md).
 */
export function MapPage() {
  return <section aria-labelledby="we-map-title">
    <PageHeader id="we-map-title" eyebrow="Near you" title="Good food is closer than you think" description="Restaurants nearby with leftover food at big discounts." />
    <EmptyState icon={Map} title="The live map is on its way" description="You will see restaurants with discounted leftovers as dots on a map and reserve portions for pickup." />
  </section>
}

export function MyPickupsPage() {
  return <section aria-labelledby="we-pickups-title">
    <PageHeader id="we-pickups-title" eyebrow="Customer" title="My pickups" description="Your reserved portions and pickup codes." />
    <EmptyState icon={ShoppingBag} title="No pickups yet" description="Reserve portions from a deal on the map and they will appear here with a pickup code." />
  </section>
}
