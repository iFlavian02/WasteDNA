import { Navigate, Route, Routes } from 'react-router-dom'
import { ACCOUNTS } from '../accounts/accounts.js'
import '../dashboard/dashboard.css'
import { useLoad } from '../redistribution/hooks.js'
import { FoodMap } from './FoodMap.jsx'
import { OrdersPage } from './OrdersPage.jsx'
import { PlacePage } from './PlacePage.jsx'
import { useFoodMap } from './useFoodMap.js'
import './personal.css'

const CUSTOMER_ID = ACCOUNTS.personal.customerId

/**
 * Personal account area, mounted at `/personal/*` (docs/PERSONAL_MAP.md).
 * The pages share one live data source, so opening a restaurant needs no
 * new request. Orders are placed as the personal account's `customerId`.
 */
export default function PersonalPage({ api, sessionId }) {
  const map = useFoodMap(api, sessionId)
  const orders = useLoad(() => map.client.orders({ customer_id: CUSTOMER_ID }), [map.client, sessionId])
  const ordersApi = { ...orders, client: map.client }
  return <Routes>
    <Route index element={<FoodMap map={map} />} />
    <Route path="places/:donorId" element={<PlacePage map={map} customerId={CUSTOMER_ID} onOrdered={orders.reload} />} />
    <Route path="orders" element={<OrdersPage map={map} orders={ordersApi} />} />
    <Route path="*" element={<Navigate to="/personal" replace />} />
  </Routes>
}
