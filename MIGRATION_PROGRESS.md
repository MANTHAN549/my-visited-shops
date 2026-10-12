# GitHub storage migration progress

## Phase 1: New storage layer

- Status: committed as aa63c07.
- Added strict version 2 persisted record/document schemas, encrypted GitHub Contents API read/write, retry queue, conflict re-fetch, tombstones, visit rollups, offline cache reads, image compression, size limit, React context hooks, and initial Settings controls.
- The existing Dexie and Supabase application paths remain in place for migration.
- Verification: typecheck passed; focused GitHub store tests passed (4 tests); targeted ESLint passed.

## Phase 2: Migration tool

- Status: implemented; targeted typecheck, tests and ESLint pass.
- Added isolated migration readers for IndexedDB and optional Supabase. The page decrypts with existing local/cloud key flows, validates records, previews source/final counts, reports invalid rows and orphan visits, offers backups, merges by timestamps and tombstones, uploads, re-downloads, verifies IDs/counts, then enables explicit local IndexedDB clearing.
- Old source data remains until the explicit post-verification clear action. Supabase records are never cleared.
- Verification: typecheck passed; focused store/migration merge tests passed (6 tests); targeted ESLint passed.
- Next: switch app reads/writes and settings to GitHub storage, isolate legacy readers/dependencies, and update backup/erase flows.

## Existing workspace changes

The following files had edits before this task began and must be preserved: `README.md`, `src/components/layout/CloudSyncPanel.tsx`, `src/database/schema.ts`, `src/pages/BackupRestorePage.tsx`, `src/pages/SettingsPage.tsx`, `src/services/cloudAccountService.ts`, `src/services/cloudSyncService.ts`, `src/services/shopService.ts`, `src/services/visitService.ts`, `tests/database.test.ts`, and `vite.config.ts`. The untracked `.npm-cache/` directory is also pre-existing.
