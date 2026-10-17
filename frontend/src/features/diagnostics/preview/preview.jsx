import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../index.css'
import '../../../App.css'
import PreviewApp from './PreviewApp.jsx'

createRoot(document.getElementById('root')).render(<StrictMode><div className="app-shell"><main><PreviewApp /></main></div></StrictMode>)
