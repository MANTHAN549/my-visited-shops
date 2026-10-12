# GitHub Pages setup

## Deployment configuration

The application uses Vite's configurable `base` and React Router's `HashRouter`, so it can run under the repository subpath without server-side route rewrites. The Actions workflow sets `VITE_BASE_PATH=/my-visited-shops/` for production builds; local development keeps the existing `/` default.

`.github/workflows/deploy.yml` builds and deploys on pushes to `main` and supports manual runs with `workflow_dispatch`. It uses Node.js 22, `npm ci`, the existing `npm run build` command, and GitHub's Pages artifact/deployment actions. The PWA plugin derives asset, manifest, and service-worker paths from Vite's configured base.

## One-time GitHub settings

1. In **Settings → Secrets and variables → Actions → Variables**, add:
   - `VITE_SUPABASE_URL`: the existing Supabase project URL.
   - `VITE_SUPABASE_PUBLISHABLE_KEY`: that project's publishable key (the older anon/public key is also a browser-safe key if that is what the project provides).
2. These values are embedded in browser assets by Vite. The publishable key is public by design; never add a service-role key, secret API key, or database password here. Supabase RLS and authentication must protect data.
3. In **Settings → Pages**, select **GitHub Actions** as the build and deployment source.
4. In Supabase **Authentication → URL Configuration**, allow the production redirect URL `https://manthan549.github.io/my-visited-shops/` and local development URL `http://localhost:5173/`. The app's password reset flow returns to its settings route using the URL hash.

The `.env.local` file remains ignored by Git. `.env.example` contains placeholders only and needs no change for this deployment setup.

## Run and verify deployment

Push a commit to `main`, or open **Actions → Deploy to GitHub Pages → Run workflow** and select `main`. Check both the build and deploy jobs in the Actions run. The published site should be available at:

<https://manthan549.github.io/my-visited-shops/>

After deployment, verify the site loads, open a route through the app's navigation, and refresh. Hash-based routes should continue to load on GitHub Pages. Install the PWA and check offline behavior separately on a supported secure browser context.

If the site returns 404, confirm Pages uses **GitHub Actions**, the workflow ran from `main`, the repository is named `my-visited-shops`, and the Vite build used `/my-visited-shops/`. If cloud sync reports that it is not configured, check the two repository Actions variables and rerun the workflow so the values are included in the build.

## Configuration inspected

- `vite.config.ts` already reads `VITE_BASE_PATH`, retains the existing Vite/PWA plugins, and scopes the service worker and navigation fallback to the configured base.
- `src/main.tsx` and `src/app/router.tsx` use `HashRouter`, avoiding Pages rewrite requirements.
- `src/services/supabaseClient.ts` reads `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`; no service-role credential is needed in the browser.
- `.gitignore` excludes `.env.local`, local environment files, build output, and personal backup files.
- No deployment workflow existed at the time of setup.

## Manual and unverified items

The workflow has not been run against GitHub from this workspace. A repository maintainer must add the Actions variables, select GitHub Actions as the Pages source, configure the Supabase redirect allowlist, and push the workflow to `main` or start it manually. The expected URL and permissions can only be verified after that run completes.
