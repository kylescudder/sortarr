# Sortarr (working name)

A self-hosted Radarr backlog browser: find missing films, sort by runtime and search selected batches. No public hostname configured. Unrelated to the existing Jaredharper1/Sortarr project.

## Development

Use Bun 1.4.2 (the installed version, also used in CI and Docker).

```sh
bun install
cp .env.example .env
# Set RADARR_URL and RADARR_API_KEY in .env
bun run dev
```

Open http://127.0.0.1:3210. The API key stays on the server. No database is required. This initial version has no user accounts: keep it local or put it behind your existing authenticated proxy before allowing remote access.

## Checks

See [CONTRIBUTING.md](CONTRIBUTING.md). Run `bun run build`, `bun run typecheck`, `bun run lint`, `bun run format:check`, `bun run test`, then `bun run test:e2e`. The first build generates TanStack Router's route types. Install Chromium once with `bunx --no-install playwright install chromium`.

The permanent Playwright suite uses a fake Radarr at the HTTP boundary and the production app on ports 43211 and 43210. It never contacts your real Radarr or downloads media. Reports go to ignored `playwright-report`, `test-results`, and `artifacts` directories.

## Database

None. Radarr remains the source of truth. Filters and selections are held in the browser until reload; credentials are environment variables.

## Deployment

See [deploy/README.md](deploy/README.md). No automatic production deployment is configured.

## Runtime configuration

| Variable       | Purpose                                                   | Default                           |
| -------------- | --------------------------------------------------------- | --------------------------------- |
| RADARR_URL     | Radarr base URL, including any URL base such as `/radarr` | Required                          |
| RADARR_API_KEY | Radarr Settings → General → Security API key              | Required                          |
| HOST           | Production bind address                                   | `127.0.0.1` (`0.0.0.0` in Docker) |
| PORT           | Production port                                           | `3210`                            |

## Backlog workflow

Only movies with `hasFile: false` are listed. The default shows monitored, available films with known runtimes, shortest first. Change the monitoring and availability filters to include other missing films. Runtime is Radarr's metadata in minutes, not Emby's file duration. Unknown, zero and negative runtimes appear separately and sort last in either direction. Refresh metadata in Radarr if runtimes are missing; this version does not enrich from TMDb or add new movies.

Use title search, runtime ceilings, or Radarr tags to narrow the backlog. Import-list membership is not supplied by the movie API; use tags assigned by the import list. Select at most 20 films, choose **Search selected in Radarr**, then confirm. The server rereads the library to reject already-downloaded selections and submits `MoviesSearch` through `/api/v3/command`. A receipt means Radarr accepted the search; it does not prove a download started or completed. Check Radarr Activity for results. Sorting here does not control downloader priority. Unmonitored movies can be explicitly searched if you include and select them.

Runtimes rank viewing effort. They do not measure release availability, download speed or file size. There is no automatic queue, Emby integration, playback tracking or release probing in this version.
