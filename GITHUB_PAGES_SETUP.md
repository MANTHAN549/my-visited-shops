# GitHub Pages setup

The Vite build supports the project subpath `/my-visited-shops/`, and HashRouter keeps client-side routes working on GitHub Pages. The deployment workflow builds and publishes the app without storage credentials. It must never receive a GitHub data token.

## Create the private data repository and token

1. Create a **private** GitHub repository named `my-visited-shops-data` (or choose another private repository) and its default branch, usually `main`.
2. In GitHub account settings, create a fine-grained personal access token. Restrict repository access to this data repository only and grant **Contents: Read and write**.
3. In the deployed app's **Settings**, enter your GitHub username, repository, branch, and token, then save and test. The token is stored in that browser's local storage. Repeat on each device. Never commit or publish it.
4. Set the same GitHub data passphrase on each device. It is used to encrypt `data.json` before upload and is held in memory only. A forgotten passphrase cannot be recovered.

The app creates the encrypted `data.json` file on first use. GitHub Pages Actions variables and `.env` configuration are not used for storage credentials.

## Deploy

In the application repository, open **Settings → Pages** and select **GitHub Actions** as the source. Push to `main` or run **Actions → Deploy to GitHub Pages → Run workflow**. The workflow sets `VITE_BASE_PATH=/my-visited-shops/` and builds with Node.js 22.

Published app: <https://manthan549.github.io/my-visited-shops/>

## Migrate old records

Open the deployed app on every device that contains old data. Configure GitHub settings and unlock the data file, then go to `#/migrate` (also linked as **Move old data** in Settings). Preview IndexedDB and optional Supabase records, download the offered backup, upload, and wait for verification. Only then may you clear old IndexedDB on that device. Keep `src/migration/` until all devices are migrated and verified. Then delete `src/migration/`, its route, and the Settings link, and run `npm uninstall dexie @supabase/supabase-js`.

## Privacy and caching

The GitHub token is never embedded in the build or workflow. The service worker uses a `NetworkOnly` rule for `api.github.com`; only static app resources and map tiles are cached. The encrypted file lives in your private data repository. Keep an independent backup and passphrase copy.
