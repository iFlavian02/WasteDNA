/**
 * Pure helpers for the Data page (Upload.jsx): checking a staged CSV before
 * upload and turning the dataset summary and status into the "Current
 * dataset & data health" card. Tested with `node --test`.
 */

/** Same limit as the backend (`MAX_UPLOAD_BYTES`, docs/PLATFORM_DATASETS.md). */
export const MAX_UPLOAD_BYTES = 5_000_000
export const TEMPLATE_COLUMNS = ['date', 'dish_id', 'dish_name', 'category', 'time_slot', 'prepared_qty', 'sold_qty', 'unit_cost_ron']

export function formatFileSize(bytes) {
  if (bytes < 1000) return `${bytes} B`
  if (bytes < 1_000_000) return `${(bytes / 1000).toFixed(bytes < 10_000 ? 1 : 0)} kB`
  return `${(bytes / 1_000_000).toFixed(1)} MB`
}

/** Null when the file can be uploaded, otherwise the reason it cannot. */
export function csvFileProblem(file, maxBytes = MAX_UPLOAD_BYTES) {
  if (!file) return 'Choose a CSV file first.'
  const isCsv = /\.csv$/i.test(file.name || '') || ['text/csv', 'application/vnd.ms-excel'].includes(file.type)
  if (!isCsv) return `${file.name} is not a .csv file.`
  if (!file.size) return `${file.name} is empty.`
  if (file.size > maxBytes) return `${file.name} is ${formatFileSize(file.size)}; the limit is ${formatFileSize(maxBytes)}.`
  return null
}

const number = new Intl.NumberFormat('en-US')
const money = new Intl.NumberFormat('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
const day = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })

export const formatCount = value => number.format(value)
const days = count => `${formatCount(count)} ${count === 1 ? 'day' : 'days'}`
export const formatDay = iso => day.format(new Date(`${iso}T00:00:00Z`))

const TERMINAL = new Set(['ready', 'insufficient_data', 'error'])

/** `{ done, ready, total, settled }` over the analysis components (summary included). */
export function analysisProgress(components = {}) {
  const states = Object.values(components)
  return {
    total: states.length,
    done: states.filter(state => TERMINAL.has(state)).length,
    ready: states.filter(state => state === 'ready').length,
    settled: states.every(state => TERMINAL.has(state)),
  }
}

/**
 * The four stat tiles and the integrity checks. Every value comes from the
 * backend: an accepted import has already passed its row validation (ISO
 * dates, 0 ≤ sold ≤ prepared, unit cost > 0), so those checks are shown as
 * passed. Unsold is prepared minus sold, not proven waste.
 */
export function datasetHealth({ result, components, isSynthetic }) {
  const progress = analysisProgress(components)
  const recordedDays = result.daily?.length ?? 0
  const dishes = result.dishes?.length ?? 0
  const rate = result.unsold_rate === null || result.unsold_rate === undefined ? null : result.unsold_rate * 100
  return {
    stats: [
      {
        id: 'status',
        label: 'Status',
        value: isSynthetic ? 'Demo dataset active' : 'Uploaded dataset active',
        note: progress.settled ? `${progress.ready} of ${progress.total} analyses ready` : `Analysing… ${progress.done} of ${progress.total} done`,
        tone: progress.settled ? 'ok' : 'busy',
      },
      {
        id: 'records',
        label: 'Records',
        value: `${formatCount(dishes)} ${dishes === 1 ? 'dish' : 'dishes'}`,
        note: `${days(recordedDays)} with records`,
      },
      {
        id: 'coverage',
        label: 'Coverage',
        value: days(result.period.calendar_days),
        note: `${formatDay(result.period.from)} – ${formatDay(result.period.to)}`,
      },
      {
        id: 'unsold',
        label: 'Unsold food',
        value: `${formatCount(result.unsold_portions)} portions`,
        note: `${money.format(result.unsold_cost_ron)} RON cost${rate === null ? '' : ` · ${rate.toFixed(1)}% of prepared`}`,
        tone: 'accent',
      },
    ],
    checks: ['Valid dates (YYYY-MM-DD)', 'Sold never above prepared', 'Unit costs positive'],
    progress,
  }
}
