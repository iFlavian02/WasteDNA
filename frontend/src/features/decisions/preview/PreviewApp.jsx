import { useEffect, useMemo, useState } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { createClient } from '../../../api/client.js'
import { ErrorState, LoadingState } from '../../../components/States.jsx'
import DecisionsPage from '../index.jsx'

function RedistributionStub() {
  const location = useLocation()
  return <section><h1>Redistribution (stub)</h1><p>Prefill received:</p><pre>{JSON.stringify(location.state?.prefill ?? null, null, 2)}</pre></section>
}

/** Mounts the decisions page at /decisions/* with the props member 1's shell will pass. */
export default function PreviewApp() {
  const api = useMemo(() => createClient(), [])
  const [dataset, setDataset] = useState(null)
  const [error, setError] = useState(null)
  useEffect(() => {
    // Reuse one demo dataset across reloads; the backend keeps at most a few active datasets.
    const saved = sessionStorage.getItem('decisions-preview-dataset')
    const reuse = saved ? api.request(`/api/datasets/${saved}`).catch(() => null) : Promise.resolve(null)
    reuse.then(existing => existing || api.request('/api/datasets/demo', { method: 'POST' }))
      .then(found => {
        sessionStorage.setItem('decisions-preview-dataset', found.dataset_id)
        setDataset(found)
      })
      .catch(setError)
  }, [api])
  if (error) return <ErrorState error={error} />
  if (!dataset) return <LoadingState label="Loading demo dataset…" />
  return <MemoryRouter initialEntries={['/decisions/actions']}>
    <Routes>
      <Route path="/decisions/*" element={<DecisionsPage api={api} datasetId={dataset.dataset_id} isSynthetic={dataset.is_synthetic} />} />
      <Route path="/redistribution" element={<RedistributionStub />} />
    </Routes>
  </MemoryRouter>
}
