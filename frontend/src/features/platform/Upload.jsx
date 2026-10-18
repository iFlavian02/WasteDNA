import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ErrorState } from '../../components/States.jsx'

export default function Upload({ api, onSelect }) {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function importDataset(path, body) {
    setBusy(true)
    setError(null)
    try {
      const record = await api.request(path, { method: 'POST', body })
      onSelect(record)
      navigate('/business')
    } catch (caught) { setError(caught) }
    finally { setBusy(false) }
  }
  return <section className="platform-page">
    <h1>Analyze restaurant surplus</h1>
    <p>Upload a UTF-8 CSV with dates, dishes, prepared and sold portions, and cost per portion. Results are tied to this dataset.</p>
    <p><a href="/api/template.csv" download>Download CSV template</a></p>
    <form onSubmit={event => { event.preventDefault(); if (file) { const body = new FormData(); body.append('file', file); importDataset('/api/datasets', body) } }}>
      <label htmlFor="csv-file">Restaurant CSV</label>
      <input id="csv-file" type="file" accept=".csv,text/csv" required onChange={event => setFile(event.target.files?.[0] || null)} />
      <button type="submit" disabled={busy || !file}>Upload CSV</button>
    </form>
    <p>Or explore the synthetic demo dataset.</p>
    <button type="button" disabled={busy} onClick={() => importDataset('/api/datasets/demo')}>Load demo data</button>
    {busy && <p role="status">Importing data…</p>}
    {error && <ErrorState error={error} />}
    {error?.details?.length > 0 && <ul>{error.details.map((detail, index) => <li key={index}>{detail.row ? `Row ${detail.row}: ` : ''}{detail.message}</li>)}</ul>}
    <p><Link to="/business">Back to the dashboard</Link></p>
  </section>
}
