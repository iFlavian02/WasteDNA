import { Tag } from 'lucide-react'
import { EmptyState } from '../../components/States.jsx'
import { PageHeader } from '../../components/ui.jsx'

/**
 * Business deals, mounted at `/business/deals/*` with `{ api, sessionId,
 * prefill }`. Placeholder until plan step 4 (docs/UI_PLAN.md).
 */
export default function DealsPage() {
  return <section aria-labelledby="we-deals-title">
    <PageHeader id="we-deals-title" eyebrow="Business" title="Deals" description="Sell today's leftovers at a discount. You choose the portions, the normal price and the discount." />
    <EmptyState icon={Tag} title="Deal posting is on its way" description="This page will let you post discounted portions, edit prices while a deal is live and confirm customer pickups." />
  </section>
}
