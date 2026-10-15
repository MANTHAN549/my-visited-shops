# My Visited Shops

My Visited Shops is a Vite + React progressive web app for recording shops, contacts, GPS coordinates, photos, and visit history. Every device reads and writes the same encrypted `data.json` in your private GitHub repository through the GitHub Contents API.

The app encrypts records in the browser with AES-GCM. A PBKDF2-SHA256 key is derived from your GitHub data passphrase using at least 600,000 iterations. The passphrase stays in memory only. GitHub receives the encrypted file, while the fine-grained token is stored in that device's browser `localStorage`.

## Features

- Search, filter, and map shops; save addresses, contacts, tags, notes, and compressed photos.
- Record visits with dates, purpose, notes, and amount spent.
- Share one encrypted data file across multiple devices, with timestamp merges and deletion tombstones.
- Read a local cached copy while offline; writes require a connection.
- Export and restore encrypted or plain JSON backups.
- Move existing IndexedDB and optional Supabase records with the migration tool.

## Set up GitHub storage

1. Create a **private** GitHub repository named `my-visited-shops-data` (or another private repository you control). Create its default branch, such as `main`.
2. Create a fine-grained personal access token scoped only to that repository. Grant **Contents: Read and write**. Do not put the token in source code, `.env` files, GitHub Actions variables, or commits.
3. Open the app, go to **Settings**, and enter your GitHub username, data repository, branch, and token. Save and test the connection.
4. Set a GitHub data passphrase of at least 12 characters. Use the same passphrase on every device and keep a secure copy: a forgotten passphrase cannot be recovered.
5. Repeat the Settings configuration on each device. The token is saved only in that device's browser.

The app creates `data.json` on first use. The file contains versioned encrypted records, settings, and deletion tombstones. GitHub credentials and the passphrase are not stored in the data file.

## Migrate existing data

Run the migration on **every device** that has old local records:

1. Configure GitHub storage and unlock it with the new GitHub data passphrase.
2. Open **Settings → Move old data** or go to `#/migrate`.
3. Preview this device's IndexedDB records. Optionally sign in to the old Supabase account and provide its cloud passphrase or recovery code.
4. Review invalid records and orphan visits. Download the migration backup before uploading.
5. Choose **Upload and verify**. The tool re-downloads the GitHub data and checks IDs and counts.
6. Only after the page reports **Verified**, use **Clear old data on this device** if desired. This clear action never removes Supabase records.

Keep the migration code until every device is migrated and verified. The exact cleanup command is documented in [src/migration/README.md](src/migration/README.md).

## Backup and restore

Use **Backup & Restore** to download encrypted JSON (recommended) or plain JSON. The backup password is independent of the GitHub data passphrase. Store backups somewhere safe. Restore supports merge and replace; replace changes the shared GitHub file for all devices. CSV export remains available from the shop and visit lists.

The app warns above 5 MB and refuses writes that would make `data.json` exceed 50 MB. Shop images are resized to at most 800 pixels and compressed as JPEG before saving. GitHub's Contents API is used with the raw media type for downloads over 1 MB.

## Development

Requirements: Node.js 20.19 or newer.

```sh
npm install
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
```

The app uses HashRouter and supports GitHub Pages under `/my-visited-shops/`. The deploy workflow needs no application token or Supabase configuration. See [GITHUB_PAGES_SETUP.md](GITHUB_PAGES_SETUP.md).

Map tiles, routing, and optional reverse geocoding contact their providers when those features are used. The service worker does not cache GitHub API responses.
