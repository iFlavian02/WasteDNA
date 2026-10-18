# Home menu and demo accounts

`/` is the WiseEat home menu. Before any dashboard opens, the visitor chooses one of two **preset demo accounts**. There is no login, password or username check; this is a demo and must not be treated as authentication.

| Account | Who | Opens | Sidebar | Top bar |
|---|---|---|---|---|
| Business account | **Hotel Luc Berlin** (the business itself: hotel & restaurant, Berlin-Mitte) | `/dashboard`, the waste dashboard from `DASHBOARD_UI.md` | Property selector, Overview, Categories, My goals, Tracked items, Settings, Help, data workspace links | Dashboard filters |
| Personal account | Lena Hoffmann, Berlin-Mitte | `/personal`, surplus deals near you | Account badge, Deals near you, Help | No filters |

Both top bars show the account and a **Switch account** link back to `/`. The home menu marks the account used last.

## Sidebar animation

The home menu uses the same sidebar as the dashboards (`frontend/src/components/Sidebar.jsx`), on the left:

1. **On `/`** it is a slim rail (`sidebar--rail`, 5.5 rem) with the WE logo tile and a live dot.
2. **On "Continue as …"** the account is saved and the same `<aside>` switches to the full sidebar of that account with `sidebar--expanding`. Its width transitions to 16 rem (0.56 s), the brand, property and footer fade in, and the menu items slide in one after another. The home content fades out to the right.
3. **After 560 ms** (`EXPAND_MS` in `Home.jsx`, matching the CSS transition) the app navigates to the account's home. Its sidebar has the same width and content, so the hand-over is seamless.

On phones (≤ 820 px) and with `prefers-reduced-motion`, there's no rail or animation: the home menu shows a compact brand bar and navigates immediately. The sidebar always renders a single `<aside>`, so React keeps the element and the width can animate. Keep that structure when editing.

## Personal account: surplus deals

`/personal` shows only deals, with no impact figures:

- **Cheap deals:** the three cheapest deals at €5 or less (`cheapDeals`).
- **All surplus deals nearby:** every deal with category, place, area, distance, pickup window, portions left, the discount badge, the price and the struck-through original price. A **Nearest / Cheapest / Biggest discount** toggle sorts them (`sortDeals`).

The deals are presentation data in `features/personal/data.js`, labelled "Demo data". Reservations are not implemented; the page says so.

## Code

| File | Role |
|---|---|
| `frontend/src/features/accounts/accounts.js` | Preset `ACCOUNTS`, `readAccount` / `saveAccount` / `clearAccount` (localStorage key `wiseeat-account`, safe when storage is blocked), `accountForPath(pathname)` |
| `frontend/src/features/accounts/Home.jsx`, `home.css` | The home menu: rail sidebar, account cards, and the expand-then-navigate flow |
| `frontend/src/components/Sidebar.jsx` | `Sidebar` (props `account`, `rail`, `expanding`, `activeId`, `open`, `onClose`) and `Brand`, shared by the home menu and the shell |
| `frontend/src/components/navigation.js` | `NAVIGATION` menu per account; Help is added to every menu |
| `frontend/src/features/personal/PersonalHome.jsx`, `personal.css`, `data.js` | Personal deals page and its demo data, `discountPct`, `sortDeals`, `cheapDeals`, `formatEur` |
| `frontend/src/App.jsx` | Top-level routes: `/` renders `Home` outside the shell; every other path goes through `AccountShell` |
| `frontend/src/App.css` | Rail and expanding sidebar styles (search "Home menu: slim rail") |
| `frontend/src/components/Icon.jsx` | Icons `store`, `user`, `arrowRight`, `check`, `switch`, `leaf` |

`AccountShell` reads the stored account on every navigation:

- **No account:** redirects to `/`.
- **A path owned by the other account** (`accountForPath`): redirects to the chosen account's home.
- **Otherwise:** renders the shell with that account's menu, top bar and profile.

`/help` is shared. Every path except `/personal` belongs to the business account. The business dashboard is at `/dashboard`. `activeNavigation` in `features/dashboard/data.js` maps `/dashboard` and `/personal` to each menu's first item.

## Adding or changing an account

1. Add an entry to `ACCOUNTS`: `id`, `kind`, `name`, `initials`, `role`, `organization`, `home`, `summary`, `features`.
2. Give it a menu in `components/navigation.js`, and its own path prefix in `accountForPath`.
3. Add its home route inside `Shell` in `App.jsx`.
4. Extend `accounts.test.js`.

## Verification

From `frontend`:

```bash
node --test "src/**/*.test.js"   # includes accounts.test.js and personal/data.test.js
npm run lint
npm run build
```

`src/features/platform/release.e2e.test.js` (opt-in, needs `WASTEDNA_FRONTEND_URL`) starts on the home menu and chooses **Continue as Hotel Luc Berlin** before checking the dashboard.
