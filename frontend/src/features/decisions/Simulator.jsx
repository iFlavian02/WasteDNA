import { useEffect, useMemo, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState, ErrorState, LoadingState } from '../../components/States.jsx'
import { dishOptions, formatPortions, simulationFigures, sliderRange, TIME_SLOTS, WEEKDAYS } from './logic.js'
import { useComponent } from './useComponent.js'

const UNSOLD_COLOR = '#2a78d6'
const SHORTAGE_COLOR = '#eb6834'

export default function Simulator({ api, datasetId }) {
  const location = useLocation()
  const summary = useComponent(api, datasetId, 'summary')
  const patterns = useComponent(api, datasetId, 'patterns')
  const dishes = useMemo(() => dishOptions(summary.envelope, patterns.envelope), [summary.envelope, patterns.envelope])
  const [selection, setSelection] = useState(() => location.state?.selection || { dish_id: '', weekday: 'Friday', time_slot: 'dinner' })
  const dishId = selection.dish_id || dishes[0]?.id || ''

  const [attempt, setAttempt] = useState(0)
  const requestKey = `${datasetId}/${dishId}/${selection.weekday}/${selection.time_slot}/${attempt}`
  const [simulation, setSimulation] = useState({ key: null, result: null, error: null })
  const [slider, setSlider] = useState({ key: null, value: 0 })

  // One request per selection; the slider below only reads the returned curve.
  useEffect(() => {
    if (!dishId) return undefined
    let cancelled = false
    api.request(`/api/datasets/${encodeURIComponent(datasetId)}/simulate`, {
      method: 'POST',
      body: { dish_id: dishId, weekday: selection.weekday, time_slot: selection.time_slot, requested_quantity: 0 },
    }).then(envelope => {
      if (!cancelled) setSimulation({ key: requestKey, result: envelope.result, error: null })
    }).catch(error => {
      if (!cancelled) setSimulation({ key: requestKey, result: null, error })
    })
    return () => { cancelled = true }
  }, [api, datasetId, dishId, selection.weekday, selection.time_slot, requestKey])

  const update = field => event => setSelection(current => ({ ...current, dish_id: dishId, [field]: event.target.value }))
  const isCurrent = simulation.key === requestKey
  const result = isCurrent ? simulation.result : null
  const range = sliderRange(result)
  const quantity = slider.key === requestKey ? slider.value : range?.start ?? 0
  const setQuantity = value => setSlider({ key: requestKey, value })
  const figures = range ? simulationFigures(result, quantity) : null
  const loading = Boolean(dishId) && !isCurrent
  const error = isCurrent ? simulation.error : null

  return <section aria-labelledby="simulator-title">
    <h1 id="simulator-title">What-if simulator</h1>
    <p className="decisions-muted">Empirical outcomes from past services of the same dish; no model is trained. Values are per service.</p>
    <div className="decisions-controls decisions-noprint">
      <label>Dish
        <select value={dishId} onChange={update('dish_id')}>
          {dishes.length === 0 && <option value="">Loading dishes…</option>}
          {dishes.map(dish => <option key={dish.id} value={dish.id}>{dish.label}</option>)}
          {dishId && !dishes.some(dish => dish.id === dishId) && <option value={dishId}>{dishId}</option>}
        </select>
      </label>
      <label>Or dish ID
        <input key={dishId} defaultValue={dishId} placeholder="dish-01"
          onBlur={event => event.target.value.trim() && event.target.value.trim() !== dishId && update('dish_id')({ target: { value: event.target.value.trim() } })}
          onKeyDown={event => event.key === 'Enter' && event.currentTarget.blur()} />
      </label>
      <label>Weekday
        <select value={selection.weekday} onChange={update('weekday')}>{WEEKDAYS.map(day => <option key={day}>{day}</option>)}</select>
      </label>
      <label>Service
        <select value={selection.time_slot} onChange={update('time_slot')}>{TIME_SLOTS.map(slot => <option key={slot}>{slot}</option>)}</select>
      </label>
    </div>

    {error ? <ErrorState error={error} onRetry={() => setAttempt(value => value + 1)} />
      : loading || !result ? <LoadingState label="Loading past services…" />
        : !range ? <EmptyState title="Not enough history for this selection" description={result.limitations.join(' ')} />
          : <SimulationView result={result} range={range} quantity={quantity} setQuantity={setQuantity} figures={figures} />}
  </section>
}

function SimulationView({ result, range, quantity, setQuantity, figures }) {
  const basisText = result.basis === 'dish_weekday_slot'
    ? `Based on ${result.support_days} past ${result.selection.weekday} ${result.selection.time_slot} services.`
    : `Based on all ${result.support_days} ${result.selection.time_slot} services of this dish (not enough ${result.selection.weekday}s).`
  return <div className="decisions-sim">
    <p>{basisText} Usual batch: <strong>{result.baseline_quantity} portions</strong>.</p>
    <label className="decisions-slider decisions-noprint">Portions to prepare: <strong>{figures.quantity}</strong>
      <input type="range" min={range.min} max={range.max} value={quantity} onChange={event => setQuantity(Number(event.target.value))} />
    </label>
    <dl className="decisions-figures" aria-live="polite">
      <div><dt>Unsold (estimate)</dt><dd>{figures.unsold}</dd><dd className="decisions-muted">usual batch: {figures.unsoldAtBaseline}</dd></div>
      <div><dt>Shortage, at least</dt><dd>{figures.shortage}</dd></div>
      <div><dt>Services short, at least</dt><dd>{figures.risk}</dd></div>
      <div><dt>Production cost</dt><dd>{figures.costChange}</dd></div>
    </dl>
    {result.censored_demand && <p role="note" className="decisions-warning">Some of these services sold out, so real demand may have been higher: shortage and risk may be underestimated and unsold portions overestimated.</p>}
    <CurveChart curve={result.curve} quantity={figures.quantity} baseline={result.baseline_quantity} />
    <ul className="decisions-limitations">{result.limitations.map(text => <li key={text}>{text}</li>)}</ul>
  </div>
}

function CurveChart({ curve, quantity, baseline }) {
  const last = curve.length - 1
  const endLabel = (text, color) => function EndLabel({ x, y, index }) {
    return index === last ? <text x={x + 6} y={y} dy={4} fontSize={12} fill="#3d4f4b"><tspan fill={color}>●</tspan> {text}</text> : null
  }
  return <figure className="decisions-chart">
    <figcaption>Unsold and minimum shortage per service, by portions prepared</figcaption>
    <ResponsiveContainer width="100%" height={260}>
      <LineChart data={curve} margin={{ top: 12, right: 96, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="#e3ebe6" vertical={false} />
        <XAxis dataKey="quantity" tick={{ fill: '#5b6b67', fontSize: 12 }} stroke="#c9d6cf" label={{ value: 'portions prepared', position: 'insideBottomRight', offset: -4, fill: '#5b6b67', fontSize: 12 }} />
        <YAxis tick={{ fill: '#5b6b67', fontSize: 12 }} stroke="#c9d6cf" width={40} />
        <Tooltip cursor={{ stroke: '#9fb3aa' }} formatter={(value, name) => [formatPortions(value), name]} labelFormatter={label => `${label} portions prepared`} />
        <Legend verticalAlign="top" height={28} />
        <ReferenceLine x={baseline} stroke="#9fb3aa" strokeDasharray="4 4" label={{ value: 'usual', position: 'top', fill: '#5b6b67', fontSize: 11 }} />
        <ReferenceLine x={quantity} stroke="#172d2a" />
        <Line type="monotone" dataKey="waste_proxy_portions" name="Unsold" stroke={UNSOLD_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} label={endLabel('Unsold', UNSOLD_COLOR)} />
        <Line type="monotone" dataKey="shortage_lower_bound_portions" name="Shortage (at least)" stroke={SHORTAGE_COLOR} strokeWidth={2} dot={false} activeDot={{ r: 5 }} isAnimationActive={false} label={endLabel('Shortage', SHORTAGE_COLOR)} />
      </LineChart>
    </ResponsiveContainer>
    <details className="decisions-noprint">
      <summary>Show values as a table</summary>
      <table className="decisions-table">
        <thead><tr><th>Portions</th><th>Unsold</th><th>Shortage (at least)</th><th>Services short (at least)</th></tr></thead>
        <tbody>{curve.map(point => <tr key={point.quantity}><td>{point.quantity}</td><td>{point.waste_proxy_portions.toFixed(2)}</td><td>{point.shortage_lower_bound_portions.toFixed(2)}</td><td>{Math.round(point.risk_lower_bound * 100)}%</td></tr>)}</tbody>
      </table>
    </details>
  </figure>
}
