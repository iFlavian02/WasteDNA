import { useEffect, useMemo, useState } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { createClient } from '../../../api/client.js'
import { ErrorState, LoadingState } from '../../../components/States.jsx'
import DiagnosticsPage from '../index.jsx'

/** Development-only mount using a real demo dataset and the member 1 prop contract. */
export default function PreviewApp() {
  const api = useMemo(() => createClient(), [])
  const [dataset, setDataset] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    const saved = sessionStorage.getItem('diagnostics-preview-dataset')
    const reuse = saved ? api.request(`/api/datasets/${saved}`).catch(() => null) : Promise.resolve(null)
    reuse.then(existing => existing || api.request('/api/datasets/demo', { method: 'POST' }))
      .then(found => {
        sessionStorage.setItem('diagnostics-preview-dataset', found.dataset_id)
        setDataset(found)
      })
      .catch(setError)
  }, [api])

  if (error) return <ErrorState error={error} />
  if (!dataset) return <LoadingState label="Loading demo diagnostics…" />
  return <MemoryRouter><DiagnosticsPage api={api} datasetId={dataset.dataset_id} isSynthetic={dataset.is_synthetic} /></MemoryRouter>
}
