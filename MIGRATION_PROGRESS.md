# GitHub storage migration progress

Branch: `github-storage`

## Phase 1: New storage layer

- Status: committed as `aa63c07`.
- Added strict v2 persisted schemas, encrypted GitHub Contents API reads and writes, serialized write queue, SHA conflict retry, tombstones, visit rollups, encrypted offline cache, image compression, and Settings controls.
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
- Moved the remaining Dexie/Supabase migration readers and decrypt/auth support into `src/migration/legacy/`. Kept `dexie` and `@supabase/supabase-js`; removed `dexie-react-hooks` and `fake-indexeddb` from app dependencies/tests.
- Reworked erase to tombstone and clear shared GitHub records. Backups now read and restore the GitHub document.

## Phase 4: PWA, build, deploy

- Status: implementation complete; commit pending.
- Added an explicit NetworkOnly service-worker rule for `api.github.com`, retained map tile caching and GitHub Pages base-path behavior, and updated app/manifest descriptions, `.env.example`, and deployment workflow.
- Next: commit Phase 4, finish Phase 5 review, and rerun full verification.

## Phase 5: Docs and tests

- Status: implementation in progress.
- Rewrote the setup and project docs for a private GitHub data repository and per-device migration. Expanded mocked-fetch tests for encryption, conflict retries, large files, invalid documents, deletes, rollups, and orphan visits.
- Verification so far: typecheck passes; 55 tests pass; production build succeeds. ESLint has 9 existing warnings in unrelated components and no errors.
- Next: finish review, run all checks again, update this file, and commit Phase 5.

## Workspace notes

- The pre-existing `.npm-cache/` directory is retained and excluded from commits.
- `npm uninstall dexie-react-hooks fake-indexeddb` completed successfully and refreshed `package-lock.json`.
