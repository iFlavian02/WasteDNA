# WiseEat logo

**Use `<Logo>` from `frontend/src/brand/Logo.jsx` for every logo in the app.** Don't crop `public/wiseeat-logo.png` or other images with CSS, and don't redraw the mark. The component and assets are the same as on branch `ui` (copied 2026-10-18).

## Assets (`frontend/src/brand/`)

| File | Use |
|---|---|
| `source/wiseeat-logo-source.jpg` | The supplied logo (2048 px, cream background), kept as the source |
| `assets/wiseeat-mark.png`, `assets/wiseeat-wordmark.png` | Transparent cut-outs in dark green `#165037` and lime `#91c24c`, for light backgrounds |
| `assets/wiseeat-mark-on-dark.png`, `assets/wiseeat-wordmark-on-dark.png` | The same with dark green turned white, for the dark sidebar and dark bars |
| `assets/wiseeat-logo.png` | Stacked mark and wordmark (light backgrounds) |
| `frontend/public/favicon.png` (64 px), `apple-touch-icon.png` (180 px, cream tile) | Browser and home-screen icons, referenced in `frontend/index.html` |

The cut-outs were made by unmixing each pixel against the cream background and the two ink colours. Edges stay smooth, and the on-dark version is an exact recolour of the original artwork.

## Component

```jsx
import { Logo } from '../brand/Logo.jsx'

<Logo tone="onDark" size={40} tagline />      // dark backgrounds: white "Wise", lime "Eat", tagline below
<Logo tone="onLight" size={30} />             // white backgrounds: dark green and lime
<Logo tone="onDark" size={38} showName={false} />  // mark only
```

| Prop | Meaning |
|---|---|
| `tone` | `'onDark'` or `'onLight'` |
| `size` | Mark height in px; the wordmark scales with it |
| `showName` | Show the wordmark next to the mark (default true) |
| `tagline` | Show `brand.tagline` from `frontend/src/brand.js` under the wordmark |

The wrapper has `role="img"` and the label "WiseEat"; the images inside are decorative.

## Where it is used

| Place | Call |
|---|---|
| Dashboard sidebar (`components/Sidebar.jsx`, `Brand`) | `onDark`, 40 px, with tagline |
| Mobile top bar (`Brand compact`) | `onLight`, 30 px |
| Home menu rail (`Sidebar rail`) | `onDark`, 38 px, mark only |
| Home menu on phones (`features/accounts/Home.jsx`) | `onDark`, 34 px, with tagline |

`brand.logoSrc` (`/wiseeat-logo.png`) is still in `brand.js` for the existing brand test, but no screen uses it. `frontend/src/brand.test.js` also checks that the cut-outs and favicons exist.
