import { Navigate, Route, Routes } from 'react-router-dom'
import '../dashboard/dashboard.css'
import { FoodMap } from './FoodMap.jsx'
import { PlacePage } from './PlacePage.jsx'
import { useFoodMap } from './useFoodMap.js'
import './personal.css'

/**
 * Personal account area, mounted at `/personal/*` (docs/PERSONAL_MAP.md).
 * Both pages share one live data source, so opening a restaurant needs no
 * new request.
 */
export default function PersonalPage({ api, sessionId }) {
  const map = useFoodMap(api, sessionId)
  return <Routes>
    <Route index element={<FoodMap map={map} />} />
    <Route path="places/:donorId" element={<PlacePage map={map} />} />
    <Route path="*" element={<Navigate to="/personal" replace />} />
  </Routes>
}
