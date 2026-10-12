After all devices are migrated and verified, delete src/migration/, its route and Settings link, then run npm uninstall dexie @supabase/supabase-js.

This folder temporarily reads and validates legacy IndexedDB and Supabase records. The reader never deletes old data. Clear IndexedDB only through the explicit migration page action after GitHub verification.
