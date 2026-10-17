/**
 * Dev-only harness: `npm run dev`, then open /src/features/decisions/preview/index.html.
 * Not part of the production build (Vite builds only frontend/index.html).
 */
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../../index.css'
import '../../../App.css'
import PreviewApp from './PreviewApp.jsx'

createRoot(document.getElementById('root')).render(<StrictMode><div className="app-shell"><main><PreviewApp /></main></div></StrictMode>)
