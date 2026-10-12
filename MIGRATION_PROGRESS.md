# GitHub storage migration progress

## Phase 1: New storage layer

- Status: implemented; typecheck and focused GitHub store tests pass.
- Added strict version 2 persisted record/document schemas, encrypted GitHub Contents API read/write, retry queue, conflict re-fetch, tombstones, visit rollups, offline cache reads, image compression, size limit, React context hooks, and initial Settings controls.
- The existing Dexie and Supabase application paths remain in place for the migration phase.
- Verification: npm run typecheck passed; focused githubStore tests passed (4 tests); targeted ESLint passed.
- Next: isolate legacy Dexie/Supabase readers under src/migration/, add migration preview/upload/verification, then commit Phase 2.

## Existing workspace changes

The following files had edits before this task began and must be preserved: `README.md`, `src/components/layout/CloudSyncPanel.tsx`, `src/database/schema.ts`, `src/pages/BackupRestorePage.tsx`, `src/pages/SettingsPage.tsx`, `src/services/cloudAccountService.ts`, `src/services/cloudSyncService.ts`, `src/services/shopService.ts`, `src/services/visitService.ts`, `tests/database.test.ts`, and `vite.config.ts`. The untracked `.npm-cache/` directory is also pre-existing.
