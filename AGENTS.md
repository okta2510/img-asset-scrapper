# AGENTS.md

Assets Scrap App — image scraping/search/cropping/analyzing web app. Single Express app serves both the API and the React client.

## Commands

```bash
npm run dev     # tsx server.ts  → http://localhost:3000 (PORT env overrides)
npm run build   # vite build → dist/  +  esbuild server.ts → dist/server.cjs
npm start       # node dist/server.cjs (serves dist/ statically)
npm run lint    # tsc --noEmit  ← the ONLY verification step; there is no test suite
```

- Run `npm run lint` after every change. It is the only automated check in the repo.
- `tsconfig.json` has no `include`, so lint type-checks `server.ts`, `api/`, `vite.config.ts`, and `src/` together. Don't add config-only files that won't type-check.
- `package.json` name is `react-example` (leftover template name) — ignore it.

## Architecture (not obvious from filenames)

- **One process, two modes.** `server.ts` mounts the API, then in non-production attaches Vite in `middlewareMode` (`server.ts:1130-1144`). There is no separate Vite dev server to start.
- **Two deploy targets share one Express app:**
  - Vercel: `api/index.ts` and `api/[...path].ts` both `export default app` from `../server`. `vercel.json` rewrites all `/api/*` → `/api` and everything else → `/index.html`. `process.env.VERCEL` disables the `app.listen()` call (`server.ts:1152`).
  - Node: `npm run build` + `npm start`.
- **Two URL-normalization middlewares must be respected when adding routes** (`server.ts:40-63`):
  - Restores `req.url` from the `x-matched-path` / `x-forwarded-uri` header (Vercel strips it).
  - Prepends `/api` for paths starting with `/auth`, `/config`, `/scrape`, `/search`, `/proxy`, `/gemini`. **A new route family must be added to that list or it 404s behind the Vercel rewrite.**
- **Route ordering:** the `/api` 404 catch-all is at `server.ts:1125`, before Vite/static. New routes must be registered above it.
- Client always calls same-origin relative paths (`/api/...`): `src/App.tsx` (config, auth, scrape, search) and `src/components/GeminiAnalyzeModal.tsx` (analyze). Proxy URLs are built in `src/utils/imageEditor.ts:11`.
- `README.md` says `POST /api/scrape`; the executable truth is **GET** (`server.ts:427`, `App.tsx:533`). Trust the code.

## Auth model — read before trusting any "protected" feature

- `POST /api/auth/login` (`server.ts:232`) issues **no token, cookie, or session**. It returns the user object and the client stores it in `localStorage` under `imgrap_logged_user`.
- The entire access gate is one client-side render check: `if (!currentUser || currentUser.status !== "APPROVED")` at `src/App.tsx:785`. Server-side `status` is never enforced.
- No route under `/api/*` has an auth middleware, so `/api/scrape`, `/api/search`, `/api/proxy`, `/api/gemini/analyze` are directly callable. Don't describe a UI-only gate as security.
- `/api/auth/users` returns all usernames/emails; `/api/auth/update-status` lets any caller flip any account's status (no admin check). Login itself never rejects PENDING/REJECTED.

## Data & env gotchas

- `APP_SSCRIPT_URL`: if set to an `http…` value, register/login are forwarded to that Google Apps Script and the local DB is **bypassed entirely** (`server.ts:179-191`, `server.ts:240-249`). `vite.config.ts:17-20` also `define`s it into the client bundle, so its value ships to browsers.
- User store is a plain JSON file, not a database: `users-local-db.json` (gitignored). Path switches to `/tmp/users-local-db.json` when `VERCEL` is set (`server.ts:77-78`), i.e. Vercel writes are ephemeral.
- `initLocalDB` (`server.ts:81-116`) seeds `admin`/`admin123` (`APPROVED`) and `tester`/`tester123` (`PENDING`) if the file is missing. Passwords are stored and compared in plaintext (`server.ts:260`).
- The Google Sheet ID and the full Apps Script source are embedded as a string in `src/App.tsx:216-234` (shown to users in a setup guide). Change it there, not in a separate file.
- `GEMINI_API_KEY` and `APP_URL` come from `.env` (gitignored; copy `.env.example`). `dotenv.config()` runs at import time in `server.ts:10`.
- `.env` must not be committed; `.env.example` is the tracked template.

## Conventions

- Client fetches are hand-rolled in `src/App.tsx` (no data library, no React Query). `src/App.tsx` is a ~2000-line single component — expect to edit it in place, and keep the `useEffect` persistence keys stable (`imgrap_logged_user`, `imgrap_custom_engines`, `pic_scrape_history_logs`).
- Vite alias `@` → repo root, and `@/*` is mirrored in `tsconfig.json` paths.
- HMR is intentionally disabled via `DISABLE_HMR=true` in AI Studio; `vite.config.ts:21-27` carries a "do not modify" note.
- Tailwind v4 via `@tailwindcss/vite` (no `tailwind.config.js`).
- UI copy and docs are Indonesian; code comments are English. Keep that split.
