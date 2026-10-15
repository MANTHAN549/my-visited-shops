After old IndexedDB data is migrated and verified on every device, delete src/migration/, its route and Settings link, then run npm uninstall dexie.

This folder temporarily reads and validates legacy IndexedDB records. The reader never deletes old data. Clear IndexedDB only through the explicit migration page action after the local JSON file has been verified.
