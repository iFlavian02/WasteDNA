# Home menu and demo accounts

`/` is the WiseEat home menu. Before any dashboard opens, the visitor chooses one of two **preset demo accounts**. There is no login, password or username check; this is a demo and must not be treated as authentication.

| Account | Who | Opens | Sidebar | Top bar |
|---|---|---|---|---|
| Business account | **Trattoria Unirii** (the business itself: a restaurant on Piața Unirii, Iași, also one of the sellers on the customer map) | `/dashboard`, the waste dashboard from `DASHBOARD_UI.md` | Overview, Statistics, Actions, Orders, Data, plus data workspace links | Dashboard filters |
| Personal account | Tofan Alexandru, Centru, Iași | `/personal`, the live food map of Iași ([PERSONAL_MAP.md](PERSONAL_MAP.md)) | Account badge, Food map, Orders, Help | No filters |

Both top bars show the account and a **Switch account** link back to `/`. The home menu marks the account used last.

## Sidebar animation

The home menu uses the same sidebar as the dashboards (`frontend/src/components/Sidebar.jsx`), on the left:

1. **On `/`** it is a slim rail (`sidebar--rail`, 5.5 rem) with the WE mark (`<Logo showName={false}>`, see [BRAND.md](BRAND.md)) and a live dot.
2. **On "Continue as …"** the account is saved and the same `<aside>` switches to the full sidebar of that account with `sidebar--expanding`. Its width transitions to 16 rem (0.56 s), the brand, property and footer fade in, and the menu items slide in one after another. The home content fades out to the right.
3. **After 560 ms** (`EXPAND_MS` in `Home.jsx`, matching the CSS transition) the app navigates to the account's home. Its sidebar has the same width and content, so the hand-over is seamless.

On phones (≤ 820 px) and with `prefers-reduced-motion`, there's no rail or animation: the home menu shows a compact brand bar and navigates immediately. The sidebar always renders a single `<aside>`, so React keeps the element and the width can animate. Keep that structure when editing.

## Personal account: food map

`/personal` is a live map of Iași. Restaurants with surplus food on sale are clickable circles, and each opens a page at `/personal/places/:donorId` listing what it sells, with **Order now** on every item. The **Orders** tab (`/personal/orders`) shows the order history. The data is real backend data (redistribution offers), shared with the business account's demo session. See [PERSONAL_MAP.md](PERSONAL_MAP.md). The old static "Deals near you" page and `features/personal/data.js` were removed.

## Code

| File | Role |
|---|---|
| `frontend/src/features/accounts/accounts.js` | Preset `ACCOUNTS`, `readAccount` / `saveAccount` / `clearAccount` (localStorage key `wiseeat-account`, safe when storage is blocked), `accountForPath(pathname)` |
| `frontend/src/features/accounts/Home.jsx`, `home.css` | The home menu: rail sidebar, account cards, and the expand-then-navigate flow |
| `frontend/src/components/Sidebar.jsx` | `Sidebar` (props `account`, `rail`, `expanding`, `activeId`, `open`, `onClose`) and `Brand`, shared by the home menu and the shell |
| `frontend/src/components/navigation.js` | `NAVIGATION` menu per account; the business labels follow the focused workflow, while Help remains available to the personal account |
| `frontend/src/features/personal/` | Personal area: food map and place pages ([PERSONAL_MAP.md](PERSONAL_MAP.md)) |
| `frontend/src/App.jsx` | Top-level routes: `/` renders `Home` outside the shell; every other path goes through `AccountShell` |
| `frontend/src/App.css` | Rail and expanding sidebar styles (search "Home menu: slim rail") |
| `frontend/src/components/Icon.jsx` | Icons `store`, `user`, `arrowRight`, `check`, `switch`, `leaf`, `map`, `pin`, `clock` |

`AccountShell` reads the stored account on every navigation:

- **No account:** redirects to `/`.
- **A path owned by the other account** (`accountForPath`): redirects to the chosen account's home.
- **Otherwise:** renders the shell with that account's menu, top bar and profile.

`/help` is shared. Every path except `/personal` and `/personal/…` belongs to the business account. The business dashboard is at `/dashboard`. `activeNavigation` in `features/dashboard/data.js` maps `/dashboard` and `/personal/…` to each menu's first item.

## Adding or changing an account

1. Add an entry to `ACCOUNTS`: `id`, `kind`, `name`, `initials`, `role`, `organization`, `home`, `summary`, `features`.
2. Give it a menu in `components/navigation.js`, and its own path prefix in `accountForPath`.
3. Add its home route inside `Shell` in `App.jsx`.
4. Extend `accounts.test.js`.

## Verification

From `frontend`:

```bash
node --test "src/**/*.test.js"   # includes accounts.test.js and personal/places.test.js
npm run lint
npm run build
```

`src/features/platform/release.e2e.test.js` (opt-in, needs `WASTEDNA_FRONTEND_URL`) starts on the home menu and chooses **Continue as Trattoria Unirii** before checking the dashboard.
