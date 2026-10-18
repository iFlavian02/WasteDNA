import { useState } from 'react'
import { CloudUpload, Download, FileSpreadsheet, Sparkles } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { ErrorState } from '../../components/States.jsx'

/**
 * CSV drop zone plus "Try with demo data". On success it stores the dataset
 * through `onSelect(record)` and opens the dashboard. Row errors from the API
 * are listed under the zone and the current dataset stays selected.
 */
export default function DataImport({ api, onSelect, demoLabel = 'Try with demo data' }) {
  const navigate = useNavigate()
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function importDataset(kind, path, body) {
    setBusy(kind)
    setError(null)
    try {
      const record = await api.request(path, { method: 'POST', body })
      onSelect(record)
      navigate('/business')
    } catch (caught) { setError(caught) }
    finally { setBusy(null) }
  }

  function upload(event) {
    event.preventDefault()
    if (!file) return
    const body = new FormData()
    body.append('file', file)
    importDataset('csv', '/api/datasets', body)
  }

  function drop(event) {
    event.preventDefault()
    setDragging(false)
    const dropped = event.dataTransfer.files?.[0]
    if (dropped) setFile(dropped)
  }

  return <div className="we-import">
    <form className="we-import-form" onSubmit={upload}>
      <label htmlFor="we-csv-file" className={`we-dropzone${dragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}`}
        onDragOver={event => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={drop}>
        <span className="we-dropzone-icon" aria-hidden="true">{file ? <FileSpreadsheet /> : <CloudUpload />}</span>
        <strong>{file ? file.name : 'Drop your sales CSV here'}</strong>
        <span>{file ? `${Math.max(1, Math.round(file.size / 1024))} KB · click to choose another file` : 'or click to choose a file · UTF-8 CSV'}</span>
        <input id="we-csv-file" className="we-visually-hidden" type="file" accept=".csv,text/csv" onChange={event => setFile(event.target.files?.[0] || null)} />
      </label>
      <div className="we-import-actions">
        <button type="submit" className="we-btn we-btn--primary" disabled={!file || busy !== null}>{busy === 'csv' ? 'Uploading…' : 'Upload CSV'}</button>
        <button type="button" className="we-btn we-btn--secondary" disabled={busy !== null} onClick={() => importDataset('demo', '/api/datasets/demo')}>
          <Sparkles aria-hidden="true" />{busy === 'demo' ? 'Loading demo…' : demoLabel}
        </button>
        <a className="we-link" href="/api/template.csv" download><Download aria-hidden="true" />CSV template</a>
      </div>
    </form>
    {busy && <p role="status" className="we-visually-hidden">Importing data…</p>}
    {error && <ErrorState error={error} title="The import did not work" />}
    {error?.details?.length > 0 && <ul className="we-import-errors">{error.details.map((detail, index) => <li key={index}>{detail.row ? `Row ${detail.row}: ` : ''}{detail.message}</li>)}</ul>}
  </div>
}
