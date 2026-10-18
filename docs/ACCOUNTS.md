# Home menu and demo accounts

`/` is the WiseEat home menu. Before any dashboard opens, the visitor chooses one of two **preset demo accounts**. There is no login, password or username check; this is a demo and must not be treated as authentication.

| Account | Person | Opens | Sidebar | Top bar |
|---|---|---|---|---|
| Business account | M. Albrecht, Executive Chef, Hotel Luc Berlin | `/dashboard` (the waste dashboard from `DASHBOARD_UI.md`) | Property selector, Overview, Categories, My goals, Tracked items, Settings, Help, data workspace links | Dashboard filters |
| Personal account | Ana Popescu, food saver, Iași | `/personal` (personal impact home) | "Personal account" badge, Overview, Help | No filters |

Both top bars show the chosen person and a **Switch account** link back to `/`. The home menu marks the account used last.

## Code

| File | Role |
|---|---|
| `frontend/src/features/accounts/accounts.js` | Preset `ACCOUNTS`, `readAccount` / `saveAccount` / `clearAccount` (localStorage key `wiseeat-account`, safe when storage is blocked), `accountForPath(pathname)` |
| `frontend/src/features/accounts/Home.jsx`, `home.css` | The home menu: brand panel and two account cards with "Continue as …" |
| `frontend/src/features/personal/PersonalHome.jsx`, `personal.css`, `data.js` | Personal home: two KPIs, recent rescues, a "Surplus near you – coming soon" card. Presentation data only, labelled "Demo data". |
| `frontend/src/App.jsx` | Top-level routes: `/` renders `Home` outside the shell; every other path goes through `AccountShell` |
| `frontend/src/components/Icon.jsx` | Added icons: `store`, `user`, `arrowRight`, `check`, `switch`, `leaf` |

`AccountShell` reads the stored account on every navigation:

- **No account:** redirects to `/`.
- **A path owned by the other account** (`accountForPath`): redirects to the chosen account's home. For example, the personal account opening `/dashboard` lands on `/personal`.
- **Otherwise:** renders the shell with that account's menu, top bar and profile.

`/help` is shared. Every path except `/personal` belongs to the business account.

The dashboard moved from `/` to `/dashboard`. `activeNavigation` in `features/dashboard/data.js` maps `/dashboard` and `/personal` to the Overview item.

## Adding or changing an account

1. Add an entry to `ACCOUNTS`: `id`, `kind`, `name`, `initials`, `role`, `organization`, `home`, `summary`, `features`.
2. Give it a menu in the `navigation` object in `App.jsx`, and its own path prefix in `accountForPath`.
3. Add its home route inside `Shell`.
4. Extend `accounts.test.js`.

## Verification

From `frontend`:

```bash
node --test "src/**/*.test.js"   # includes accounts.test.js and personal/data.test.js
npm run lint
npm run build
```

`src/features/platform/release.e2e.test.js` (opt-in, needs `WASTEDNA_FRONTEND_URL`) now starts on the home menu and chooses the business account before checking the dashboard.
