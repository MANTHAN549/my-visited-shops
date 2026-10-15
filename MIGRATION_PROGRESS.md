# GitHub storage migration progress

Branch: `github-storage`

## Phase 1: New storage layer

- Status: committed as `aa63c07`.
- Added strict v2 persisted schemas, encrypted GitHub Contents API reads and writes, a serialized write queue, SHA conflict retries, tombstones, visit rollups, encrypted offline cache, image compression, and GitHub Settings controls.
- Verification at the time: typecheck, focused store tests, and targeted ESLint passed.

## Phase 2: Migration tool

- Status: committed as `410f8aa`.
- Added IndexedDB and optional Supabase readers, validation and preview, source merge, backup download, verified upload, and explicit post-verification IndexedDB clearing.
- Supabase records are never cleared. Orphan visits remain visible and preserved.
- Verification at the time: typecheck, focused merge/store tests, and targeted ESLint passed.

## Phase 3: Switch the app and remove old storage

- Status: committed as `c076222`.
- Switched shop, visit, settings, backup, and restore access to GitHub storage and context hooks. The app asks for the GitHub data passphrase at startup when a repository is configured.
- Replaced local encryption and cloud-account settings UI with GitHub settings; removed CloudSyncPanel, sync queue, local encryption, and old app database services from the main source tree.
- Moved remaining Dexie/Supabase migration readers, crypto, and auth support into `src/migration/legacy/`. Kept `dexie` and `@supabase/supabase-js`; removed `dexie-react-hooks` and `fake-indexeddb` from the app dependencies/tests.
- Reworked erase to tombstone and clear shared GitHub records. Backups now read and restore the GitHub document.

## Phase 4: PWA, build, deploy

- Status: committed as `94336c4`.
- Added an explicit NetworkOnly service-worker rule for `api.github.com`, retained map tile caching and GitHub Pages base-path behavior, and updated app/manifest descriptions, `.env.example`, and the deployment workflow.

## Phase 5: Docs and tests

- Status: complete; this commit records Phase 5.
- Rewrote README and GitHub Pages setup for a private data repository, fine-grained token setup, per-device migration, backup, verification, and cleanup steps.
- Expanded mocked-fetch tests for encrypted round trips, wrong passphrases, Unicode, 404 creation, SHA conflicts, large raw downloads, invalid data, offline writes, newest-record merge, tombstones, visit rollups, and orphan retention. Added migration-reader validation and backup round-trip tests.
- Final verification: `npm run typecheck` passed; `npm run test` passed (58 tests); `npm run build` passed. `npm run lint` completed with no errors and 9 existing warnings in unrelated files.
- `npm install` completed successfully and refreshed `package-lock.json`.

## Workspace notes

- The pre-existing `.npm-cache/` directory is retained and excluded from commits.
- npm reported one high-severity dependency advisory during install; it was not changed as part of this migration.
