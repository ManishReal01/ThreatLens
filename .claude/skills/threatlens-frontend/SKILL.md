# ThreatLens Frontend Skill

Use this skill for any frontend work in `frontend/`. It documents all constraints, patterns, and gotchas.

---

## Tech Stack

| Tool | Version / Detail |
|------|-----------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS v3 |
| Charts | recharts |
| Maps | react-simple-maps |
| Graph viz | React Flow |
| Fonts | DM Sans (body), Syne (headings), Geist Mono (code) |

---

## Critical Rules — Read Before Touching Anything

### 1. globals.css — Never Modify

`frontend/src/app/globals.css` contains exactly these lines and **must not be changed**:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body { background-color: #070d18; color: #e2e8f0; }
*, *::before, *::after { border-color: rgb(34 211 238 / 0.15) !important; }
```

**Never add `@import`** — it breaks Tailwind v3's PostCSS pipeline and causes the entire stylesheet to fail silently. Do not add new lines, rules, or variables here. All custom styles go in component-level `className` props or Tailwind config.

### 2. Next.js 14 — Never Use React 19 `use(params)`

This is Next.js **14**, not 15. The React 19 `use()` hook for unwrapping params does not exist here.

```tsx
// WRONG — crashes in Next.js 14
import { use } from "react"
const { id } = use(params)

// CORRECT — access params directly
export default function Page({ params }: { params: { id: string } }) {
  const { id } = params
}
```

### 3. PostCSS Config — Only Two Plugins

`frontend/postcss.config.mjs` must contain only `tailwindcss` and `autoprefixer`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

Never add `postcss-import` or any other plugin — it conflicts with how Next.js 14 handles CSS imports and will break `@tailwind` directives.

### 4. After Any Frontend Change — Clear `.next` Cache

If a change doesn't appear or you see stale output:

```bash
cd frontend && rm -rf .next && npm run dev
```

Then hard-refresh the browser (`Cmd+Shift+R` / `Ctrl+Shift+R`). Next.js caches aggressively — this is the fix for 90% of "my change isn't showing up" issues.

---

## Theme & Layout

- **Dark theme**: `class="dark"` is set on the `<html>` element in `frontend/src/app/layout.tsx` via `cn("dark", ...)`. Never remove it.
- **Background color**: `#070d18` (deep navy-black) — set in `globals.css`
- **Default text**: `#e2e8f0` (slate-200) — set in `globals.css`
- **Border color**: `rgb(34 211 238 / 0.15)` (cyan-400 at 15% opacity) — applied globally via `*` selector
- **Accent color**: cyan (`text-cyan-400`, `border-cyan-400/20`, etc.) — the primary SOC theme color

The three CSS custom-property font variables available in all components:
- `--font-sans` → DM Sans
- `--font-heading` → Syne
- `--font-mono` → Geist Mono

---

## Route Structure

```
frontend/src/app/
├── (app)/                   # Route group — shares the main SOC layout
│   ├── layout.tsx           # Sidebar + top bar
│   ├── page.tsx             # Dashboard (home)
│   ├── iocs/                # IOC detail
│   ├── search/              # Search UI
│   ├── bulk-lookup/
│   ├── workspace/           # Tags, notes, watchlists
│   └── threat-actors/
├── auth/                    # Login/signup pages (no layout wrapper)
├── globals.css              # DO NOT TOUCH
├── layout.tsx               # Root layout (sets dark class + fonts)
└── favicon.ico
```

The `(app)` route group is a Next.js layout grouping — the parentheses are part of the directory name and do not appear in URLs.

---

## API Client

All client-side API calls go through `frontend/src/lib/api.client.ts`:

```typescript
// Usage:
import { fetchApi } from "@/lib/api.client"

const data = await fetchApi("/api/iocs/search?q=1.2.3.4")
const result = await fetchApi("/api/feeds/health")
```

The backend URL is resolved from `NEXT_PUBLIC_BACKEND_URL` env var, defaulting to `http://127.0.0.1:8000`. Set this in `frontend/.env.local` for non-default backends.

Server components use `frontend/src/lib/api.server.ts` for SSR fetches.

---

## Component Conventions

- Components live in `frontend/src/components/`
- Use `@/` path alias for all imports (`@/lib/...`, `@/components/...`)
- Prefer Tailwind utility classes over inline styles
- Use `cn()` from `@/lib/utils` for conditional class merging (it's `clsx` + `twMerge`)

---

## Common Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Styles not updating | `.next` cache | `rm -rf .next && npm run dev` + hard refresh |
| `use is not a function` | React 19 API on Next 14 | Access `params.id` directly |
| Blank page / CSS broken | `@import` added to globals.css | Remove it immediately |
| Fonts not loading | `--font-*` variable not on `<html>` | Check `layout.tsx` `cn()` call |
| `NEXT_PUBLIC_BACKEND_URL` undefined | Missing env | Add to `frontend/.env.local` |
