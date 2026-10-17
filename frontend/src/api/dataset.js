export const DATASET_KEY = 'wastedna-dataset'

/** Keep only public dataset identity; verify persisted selections with the API. */
export function createDatasetController({ storage, onChange }) {
  const read = () => {
    try {
      const value = JSON.parse(storage.getItem(DATASET_KEY))
      return typeof value?.dataset_id === 'string' && value.dataset_id
        ? { dataset_id: value.dataset_id, is_synthetic: Boolean(value.is_synthetic) }
        : null
    } catch { return null }
  }
  const save = (record) => {
    const value = { dataset_id: record.dataset_id, is_synthetic: Boolean(record.is_synthetic) }
    storage.setItem(DATASET_KEY, JSON.stringify(value))
    onChange(value)
    return value
  }
  const clear = () => {
    storage.removeItem(DATASET_KEY)
    onChange(null)
  }
  return { read, save, clear }
}

export function isMissingDataset(error) {
  return error?.status === 404 || error?.status === 410
}
