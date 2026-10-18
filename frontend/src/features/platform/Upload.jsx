import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import Icon from '../../components/Icon.jsx'
import { csvFileProblem, datasetHealth, formatFileSize, MAX_UPLOAD_BYTES, queueMessage, TEMPLATE_COLUMNS } from './dataHealth.js'
import './data.css'

/** Summary and status of the selected dataset, polled until every analysis has finished. */
function useDatasetSnapshot(api, datasetId) {
  const [state, setState] = useState({ id: null, summary: null, status: null, error: null })
  useEffect(() => {
    if (!datasetId) return undefined
    let cancelled = false
    let timer
    async function load() {
      try {
        const path = `/api/datasets/${encodeURIComponent(datasetId)}`
        const [summary, status] = await Promise.all([api.request(`${path}/summary`), api.request(path)])
        if (cancelled) return
        setState({ id: datasetId, summary, status, error: null })
        if (!datasetHealth({ result: summary.result, components: status.components }).progress.settled) timer = setTimeout(load, 1500)
      } catch (error) {
        if (!cancelled) setState({ id: datasetId, summary: null, status: null, error })
      }
    }
    load()
    return () => { cancelled = true; clearTimeout(timer) }
  }, [api, datasetId])
  return state.id === datasetId ? state : { id: null, summary: null, status: null, error: null }
}

function ImportError({ error }) {
  const details = error.details || []
  return <div className="dw-alert" role="alert">
    <strong>{error.status === 413 ? 'File too large' : error.status === 422 ? 'The CSV has problems' : error.status === 503 ? 'Many people are importing right now' : 'Import failed'}</strong>
    <span>{error.message}</span>
    {details.length > 0 && <ul>{details.slice(0, 8).map((detail, index) => <li key={index}>{detail.row ? `Row ${detail.row}: ` : ''}{detail.message}</li>)}</ul>}
    {details.length > 8 && <span>…and {details.length - 8} more.</span>}
  </div>
}

function DatasetCard({ api, dataset }) {
  const { summary, status, error } = useDatasetSnapshot(api, dataset?.dataset_id)
  const header = <div className="dw-card-head">
    <div>
      <h2 id="dw-current-title">Current dataset &amp; data health</h2>
      <p>{dataset ? `${dataset.is_synthetic ? 'Synthetic demo data' : 'Your uploaded data'} for Trattoria Unirii` : 'Nothing imported yet'}</p>
    </div>
    {dataset && <Link to="/summary" className="dw-link">View full summary <Icon name="chevronRight" size={14} /></Link>}
  </div>

  if (!dataset) return <section className="dw-card" aria-labelledby="dw-current-title">{header}
    <p className="dw-empty">Upload a CSV or load the demo dataset above. Its status, coverage and unsold food appear here.</p>
  </section>
  if (error) return <section className="dw-card" aria-labelledby="dw-current-title">{header}<div className="dw-alert" role="alert"><strong>Couldn't load the dataset</strong><span>{error.message}</span></div></section>
  if (!summary?.result) return <section className="dw-card" aria-labelledby="dw-current-title">{header}<p className="dw-empty" role="status">Loading the dataset…</p></section>

  const health = datasetHealth({ result: summary.result, components: status.components, isSynthetic: dataset.is_synthetic })
  const inLine = health.progress.settled ? null : queueMessage(status.queue)
  return <section className="dw-card" aria-labelledby="dw-current-title">
    {header}
    {inLine && <p className={`dw-queue${status.queue.state === 'waiting' ? ' is-waiting' : ''}`} role="status"><i aria-hidden="true" /> {inLine}</p>}
    <dl className="dw-stats">
      {health.stats.map(stat => <div key={stat.id} className={`dw-stat${stat.tone ? ` dw-stat--${stat.tone}` : ''}`}>
        <dt>{stat.label}</dt>
        <dd>
          {stat.id === 'status' && <i className="dw-dot" aria-hidden="true" />}
          <strong>{stat.value}</strong>
          <span>{stat.note}</span>
        </dd>
      </div>)}
    </dl>
    <div className="dw-checks">
      <div>
        <strong>Integrity check:</strong>
        {health.checks.map(check => <span key={check}><Icon name="check" size={15} strokeWidth={2.5} /> {check}</span>)}
      </div>
      <small>{health.progress.settled ? 'Validated by the API on import' : inLine ? 'This card updates automatically' : <span role="status">Analysis running, this card updates automatically</span>}</small>
    </div>
  </section>
}

/** `/upload`, the business account's Data tab: import a CSV or the demo dataset, and see the current dataset. */
export default function Upload({ api, dataset, onSelect }) {
  const input = useRef(null)
  const [file, setFile] = useState(null)
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(null) // 'upload' | 'demo'
  const [error, setError] = useState(null)
  const [imported, setImported] = useState(null)
  const problem = file ? csvFileProblem(file) : null

  function stage(next) {
    setFile(next || null)
    setError(null)
    setImported(null)
  }

  async function importDataset(kind) {
    setBusy(kind)
    setError(null)
    setImported(null)
    try {
      let record
      if (kind === 'upload') {
        const body = new FormData()
        body.append('file', file)
        record = await api.request('/api/datasets', { method: 'POST', body })
      } else {
        record = await api.request('/api/datasets/demo', { method: 'POST' })
      }
      onSelect(record)
      setImported(kind === 'upload' ? file.name : 'The demo dataset')
      if (kind === 'upload') { setFile(null); if (input.current) input.current.value = '' }
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(null)
    }
  }

  const onDrop = event => {
    event.preventDefault()
    setDragging(false)
    if (!busy) stage(event.dataTransfer.files?.[0])
  }

  return <div className="dw-page">
    <section className="dw-card dw-card--import" aria-labelledby="dw-title">
      <div className="dw-intro">
        <span className="dw-pill"><i aria-hidden="true" /> Surplus calibration workspace</span>
        <h1 id="dw-title">Analyze restaurant surplus</h1>
        <p>Upload a UTF-8 CSV with recorded dates, dishes, prepared and sold portions, and cost per portion. The dashboard, categories and actions all calibrate to this dataset.</p>
      </div>

      <div className="dw-template">
        <span className="dw-template-icon" aria-hidden="true"><Icon name="file" size={17} /></span>
        <div>
          <strong>Need the standard table layout?</strong>
          <span>Columns: {TEMPLATE_COLUMNS.join(', ')}</span>
        </div>
        <a href="/api/template.csv" download className="dw-link"><Icon name="download" size={16} /> Download CSV template</a>
      </div>

      <form className="dw-upload" onSubmit={event => { event.preventDefault(); if (file && !problem) importDataset('upload') }}>
        <label htmlFor="csv-file" className="dw-label">Restaurant CSV file</label>
        <label
          htmlFor="csv-file"
          className={`dw-drop${dragging ? ' is-dragging' : ''}${file ? ' has-file' : ''}`}
          onDragOver={event => { event.preventDefault(); if (!busy) setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
        >
          <input ref={input} id="csv-file" className="sr-only" type="file" accept=".csv,text/csv" disabled={!!busy} onChange={event => stage(event.target.files?.[0])} />
          <span className="dw-drop-icon" aria-hidden="true"><Icon name={file ? 'file' : 'cloudUpload'} size={24} /></span>
          {file
            ? <><strong className="dw-drop-file">{file.name}</strong><small>{formatFileSize(file.size)} · <span className="dw-drop-action">Choose another file</span></small></>
            : <><span className="dw-drop-text"><span className="dw-drop-action">Choose file</span> or drag &amp; drop it here</span><small>UTF-8 .csv files only (maximum {formatFileSize(MAX_UPLOAD_BYTES)})</small></>}
        </label>

        <div className="dw-submit">
          <p className={problem ? 'is-problem' : undefined} aria-live="polite">
            <Icon name="info" size={16} />
            {problem || (file ? 'Ready to upload. The data is validated row by row before anything is saved.' : 'No file selected yet. Choose a file to enable the upload.')}
          </p>
          <button type="submit" className="dw-button" disabled={!file || !!problem || !!busy}>{busy === 'upload' ? 'Uploading…' : 'Upload CSV'}</button>
        </div>
      </form>

      {error && <ImportError error={error} />}
      {imported && <div className="dw-success" role="status"><Icon name="check" size={16} strokeWidth={2.5} /> {imported} was imported. The analysis is running; see the card below.</div>}

      <hr />

      <div className="dw-demo">
        <div>
          <strong>Or explore with the synthetic demo dataset <span className="dw-tag">Instant</span></strong>
          <span>180 days of realistic restaurant records: dishes, prepared and sold portions, and costs.</span>
        </div>
        <button type="button" className="dw-button dw-button--ghost" disabled={!!busy} onClick={() => importDataset('demo')}>
          <Icon name="flask" size={16} /> {busy === 'demo' ? 'Loading demo data…' : 'Load demo data'}
        </button>
      </div>
    </section>

    <DatasetCard api={api} dataset={dataset} />
  </div>
}
