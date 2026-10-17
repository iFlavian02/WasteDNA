# Vercel frontend deployment

WasteDNA uses a Vercel project for the Vite frontend and a separate Render web
service for the FastAPI backend. In Vercel, import this repository, set the
project Root Directory to `frontend`, and select the Vite framework preset.
The build command is `npm run build` and the output directory is `dist`.
`frontend/vercel.json` rewrites browser navigation to `index.html` so React
Router routes such as `/redistribution` load on refresh.

Set `VITE_API_BASE_URL` in Vercel to the Render service origin, for example
`https://wastedna-api.onrender.com` (no trailing slash or `/api`). Vite embeds
this value in the browser bundle at build time, so redeploy the frontend after
changing it. The shared client then requests `/api/...` from that Render host.
Set Render's `CORS_ORIGINS` to the exact Vercel frontend origin; include
`http://localhost:5173` as another comma-separated origin if local development
should continue to work.

There is one public frontend service in Vercel, serving `/`. The backend is
public on Render at `/api/*`. No Vercel service binding is needed: the browser
calls Render directly, and Vercel service bindings are for server-side calls
between services in the same Vercel project. The suggested two-service root
`vercel.json` would deploy another backend on Vercel and leave the Render
service unused. The current backend uses SQLite files and local dataset
snapshots, plus background analysis, so it has not been adapted to Vercel
Functions.

After deployment, open the Vercel home page and refresh `/redistribution`.
Check the browser network panel for calls to the Render `/api` routes, then
verify Render's `/api/health` and the CORS preflight from the Vercel origin.
