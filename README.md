# My Visited Shops

A **frontend-only** Progressive Web App for keeping a private, encrypted record of the shops you visit:
GPS coordinates, owners and contact numbers, date-wise visit notes, an interactive map, and
in-app directions back to any shop.

No backend, no PHP/Node server, no cloud database, no paid subscription. Everything lives in your
browser's IndexedDB on the device you install it on.

---

## 1. Features

### Core
- **Dashboard** with a large Leaflet/OpenStreetMap map, markers for saved shops only, marker
  preview cards, center-on-me, fit-to-markers, and an empty state.
- **Dashboard statistics** — total shops, visited at least once, never visited, total visit records.
  Opening details or clicking a marker never counts as a visit.
- **Search** across name, owner, phone, address, category, notes, tags and additional contacts.
  Runs entirely in memory over decrypted records — no record is ever sent to a search service.
- **Recently Added** and **Recently Visited** sections with image, address, last visit, contact
  shortcut, Direction and View Details actions, plus View All links.

### Shops
- **Add Shop** with "Use Current Location" (GPS + accuracy readout), draggable map marker, manual
  coordinate entry, optional reverse geocoding, categories, tags, notes, image upload, and
  unlimited additional contacts (name, phone, role, notes).
- **Validation** — required name, latitude −90…90, longitude −180…180, phone normalisation with
  country codes, and duplicate warnings (same phone / similar name / within 150 m). Records are
  **never** auto-merged.
- **Shop Details** — all contacts, coordinates, notes, tags, date added, last visit, visit count,
  mini map and full visit history.
- **Edit Shop** that preserves the entire visit history.
- **Delete Shop** with confirmation and an explicit choice about the associated visit history.
- **All Shops** — cards with call/WhatsApp/directions, category, visited/never-visited, date-added,
  last-visited and tag filters, four sort orders (including nearest), grid/list toggle and a
  matching count.

### Visits
- **Mark Visit as Done** dialog: shop name, auto date/time, multiline note, purpose, amount spent.
- Visits are stored as **separate records linked by shop ID** — older notes are never overwritten
  and a shop can hold any number of visits across different dates.
- **Visit History page** with search by shop name and note words, shop filter, date-range filter,
  newest/oldest sort, grouping by date or shop, and edit/delete per record.
- **Visit Details page** for a single record.
- Optional **readable CSV export** with an explicit unencrypted-data warning.

### Navigation
- **Full-screen directions** with origin and destination markers, route polyline, distance and
  duration *only when the routing provider returns them*, fit-to-route, retry, and a Google Maps
  external fallback.
- **Configurable routing provider** (OSRM public endpoint by default, or a self-hosted/custom URL).
- Walking/driving profiles where supported, live tracking with a Stop Tracking button, and
  geolocation watchers cleaned up on navigation end or page leave.
- Route recalculation is guarded: it only re-runs after a meaningful movement (default 50 m) or on
  explicit request — never on every GPS tick.

### Security
- Optional **encrypted mode** with a master password.
- **PBKDF2-SHA256, 600 000 iterations, 210-bit random salt** per installation.
- **AES-GCM with a fresh 96-bit random IV for every single encryption operation.**
- Only `id`, `shopId` and timestamps stay in plaintext, because they are the IndexedDB indexes.
  Every sensitive field (names, phones, address, coordinates, notes, tags, images) is encrypted
  inside the stored record before it is persisted. Search decrypts in memory.
- Manual **Lock Now**, configurable **auto-lock** on inactivity, and session key cleared from memory
  on lock. No backdoor, no default password, no hardcoded key.
- The master password is never stored — only a verifier blob that is itself AES-GCM encrypted.

### Backup and restore
- **Versioned JSON backup** (`my-visited-shops-backup-YYYY-MM-DD.json`) containing shops, visits,
  contacts, notes, images, coordinates, settings and the encryption metadata needed to decrypt.
- Sensitive payload encrypted before the file is written; a **SHA-256 integrity hash** is included
  and verified on import.
- Restore previews shop/visit counts, detects duplicate IDs and conflicts, and asks **merge or
  replace** — existing records are never silently overwritten. Import runs in a Dexie transaction so
  shop→visit relationships stay intact.

### PWA and offline
- Web app manifest with 192/512/maskable/apple-touch icons and a generated `favicon.ico`.
- Service worker precaches **static assets only**. Map tiles are cached with a size-capped
  CacheFirst policy; **routing and geocoding responses are explicitly `NetworkOnly`** and never
  cached. Decrypted records are never cached by the service worker.
- Offline indicator, graceful handling of unavailable tiles/routing, and full offline access to
  saved shops and visit notes.

### Privacy
- All records stay in local IndexedDB. No analytics, no advertising, no tracking.
- Shop names, phone numbers, notes and coordinates are never sent to any external service except
  the map-tile, geocoding and routing providers you explicitly trigger (which necessarily receive
  the coordinates involved). This is documented in Settings → Privacy.
- Strict Content-Security-Policy, no `dangerouslySetInnerHTML` on user text (all user strings are
  escaped before entering Leaflet popups), HTTPS assumed for production.

---

## 2. Tech stack

| Concern | Choice |
| --- | --- |
| UI | React 19 + TypeScript |
| Build | Vite 8 |
| Styling | Tailwind CSS 4 (`@tailwindcss/vite`) |
| Routing | React Router 7 (**HashRouter**) |
| Storage | IndexedDB via Dexie 4 |
| Crypto | Web Crypto API (PBKDF2 + AES-GCM) |
| Maps | Leaflet 1.9 + OpenStreetMap |
| Routing | OSRM-compatible configurable endpoint |
| Icons | lucide-react |
| Validation | Zod |
| PWA | vite-plugin-pwa 2 (Workbox `generateSW`) |
| Tests | Vitest 5 + fake-indexeddb + jsdom |

---

## 3. Requirements

- Node.js 20.19+ (developed on Node 22.23)
- npm 10+
- A modern browser (Chrome, Edge, Firefox or Safari)

Geolocation and service workers require a **secure context**: `https://` or `http://localhost`.
On a plain `http://` LAN address the app still runs, but GPS and installation are unavailable and
the app says so instead of failing silently.

---

## 4. Getting started

```bash
npm install          # install dependencies
npm run dev          # dev server on http://localhost:5173
npm run build        # production build into dist/
npm run preview      # serve the production build locally
```

Quality gates:

```bash
npx tsc --noEmit     # type check
npm run lint         # eslint
npm test             # vitest run (90 unit tests)
npm run test:watch   # watch mode
npm run icons        # regenerate PWA icons from scripts/generate-icons.mjs
```

---

## 5. Deployment to GitHub Pages

Routing uses **HashRouter**, so no server-side rewrite rules are needed.

1. Set the base path to your repository name, then build:

   ```bash
   # .env.production
   VITE_BASE_PATH=/my-visited-shops/
   npm run build
   ```

2. Publish `dist/` — for example with the `gh-pages` package:

   ```bash
   npx gh-pages -d dist
   ```

   Or push `dist/` to a `gh-pages` branch. The manifest, service worker and icons are emitted with
   the correct base path automatically.

`VITE_BASE_PATH` defaults to `/`. It is read in `vite.config.ts` and also drives the manifest scope
and start URL, so the installed PWA works from a subdirectory.

**Two devices = two databases.** Installing the PWA on a phone and a laptop creates two completely
independent local databases. They are *not* synchronised. Move data with an encrypted backup file
(see below).

---

## 6. Using the app

### First run
1. Open the app. You land on the Dashboard with an empty-map state.
2. Either start adding shops, or open **Settings → Security** and set a master password first
   (recommended: everything you add afterwards is encrypted at rest).

### Adding a shop
1. **Add Shop → Use Current Location** (or type coordinates, or drag the marker).
2. Fill in the name (required), category, address, owner name and phone.
3. Add extra contacts with **Add Another Contact**.
4. **Save Shop**. If a possible duplicate is detected you are warned and asked to confirm — nothing
   is merged for you.

### Recording a visit
1. Open a shop → **Mark Visit as Done**.
2. Write the note ("Purchased electrical items", "Owner said the product arrives tomorrow", …).
3. **Save Visit**. The record is stored separately, `lastVisitedAt` and the visit count update, and
   the dashboard refreshes. Visit the same shop next week and both notes are kept.

### Directions
1. **Get Directions** on any shop, or **Start Navigation** on the details page.
2. Allow location access. A route is requested from the configured provider and drawn on the map.
3. Distance and duration appear only if the provider returned them. If routing fails you get a retry
   button and an **Open in Google Maps** fallback.
4. **Stop Tracking** ends the geolocation watcher. Voice/turn-by-turn guidance is intentionally not
   claimed — use an external navigation app for that.

### Backup, restore and device transfer
1. **Backup & Restore → Export backup**. You get
   `my-visited-shops-backup-YYYY-MM-DD.json`, encrypted if encrypted mode is on.
2. Transfer the file by any method you trust (AirDrop, USB, your own cloud, email to yourself).
   The app never uploads it anywhere.
3. On the second device: **Backup & Restore → Import**, choose the file, enter the password, review
   the preview, then choose **Merge** or **Replace**.

Restoring a backup made with a *different* master password will fail to decrypt — that is by design.

---

## 7. Security model — honest limitations

What this app does:

- Derives a 256-bit AES-GCM key from your password with PBKDF2-SHA256 (600 000 iterations, random
  210-bit salt), so brute-forcing a strong password is expensive.
- Uses a fresh random IV for every encryption, so identical plaintexts never produce identical
  ciphertext.
- Authenticates every record with AES-GCM, so tampering is detected and rejected.
- Keeps only `id`, `shopId` and timestamps in plaintext, because IndexedDB needs indexes to query.

What it cannot do:

- **A forgotten master password means the encrypted data is unrecoverable.** There is no recovery
  key, no reset link and no backdoor. Keep an offline copy of the password.
- JavaScript cannot guarantee memory erasure. Locking drops all references to the derived key and to
  decrypted objects, but a hostile script running in the same origin could in principle read
  memory before that point. A frontend lock screen is **not** a defence against malicious scripts
  executing in your own application origin — it protects data at rest (IndexedDB, backups).
- Backups you export are only as safe as where you store them.
- The CSV export is **plain text**. It is provided for personal reporting only and warns you before
  it is produced.

---

## 8. Data model

Database name `my-visited-shops`, schema version 2 (Dexie migrations in `src/database/migrations.ts`).

**`shops`** — `id` (pk), `name` (idx), `category` (idx), `latitude`, `longitude`,
`primaryOwnerName`, `primaryOwnerPhone`, `contacts[]`, `imageDataUrl`, `notes`, `tags[]`,
`createdAt` (idx), `updatedAt`, `lastVisitedAt` (idx), `visitCount` (idx), plus the encrypted
payload envelope when encrypted mode is on.

**`visits`** — `id` (pk), `shopId` (idx), `visitedAt` (idx), `note`, `purpose`, `amountSpent`,
`createdAt` (idx), `updatedAt`.

**`meta`** — encryption metadata, KDF parameters, verifier blob, settings.

Plaintext index fields: `id`, `shopId`, `createdAt`, `updatedAt`, `visitedAt`, `visitCount`.
Everything else is inside the AES-GCM envelope. Visit records store only `shopId` — the shop is
never duplicated into a visit.

---

## 9. Project structure

```
src/
  app/            App.tsx, router.tsx (HashRouter), providers.tsx (session/toast/confirm)
  components/
    layout/       AppShell, Header, BottomNav, UnlockScreen, PwaController, OfflineBanner
    common/       Button, Card, Modal, ConfirmDialog, EmptyState, DataState, Toasts, PageHeader
    maps/         MapView, leafletHelpers (divIcon markers, HTML escaping)
    shops/        ShopForm, ShopCard, ShopPopupCard, ContactActions, DuplicateWarning
    visits/       VisitCard, VisitDialog
  pages/          DashboardPage, AddShopPage, ShopDetailsPage, EditShopPage, AllShopsPage,
                  DirectionsPage, VisitHistoryPage, VisitDetailsPage, BackupRestorePage,
                  SettingsPage, NotFoundPage
  database/       db.ts, schema.ts, migrations.ts
  services/       shopService, visitService, locationService, routingService, geocodingService,
                  backupService, encryptionService, securityService, settingsService, codec
  hooks/          useShops, useShop, useVisits, useSettings, useEncryptionMeta, useGeolocation, ...
  types/          domain types and encrypted-record envelopes
  utils/          phone, format, validation (Zod), geo, id, maintenance, csv
  styles/         index.css (Tailwind 4 + design tokens + Leaflet overrides)
public/           manifest.webmanifest, icons/, favicon.ico
tests/            setup, encryption, database, backup, phone, routing, utils
scripts/          generate-icons.mjs
```

---

## 10. Test results

See the accompanying report. Unit tests cover crypto round-trips, wrong-password rejection, IV
uniqueness, tamper detection, phone/WhatsApp link building, IndexedDB persistence, shop/visit
linking, search matching, duplicate detection, backup integrity, and route-recalculation guards.

Browser-only behaviours (real GPS, PWA install, offline on a real device, live OSRM responses) are
marked **untested/blocked** in the report because they cannot be executed from a headless sandbox —
they are not claimed as passing.

---

## 11. License

Personal project. Provided as-is for personal use.
