# Sortarr

A Radarr backlog browser for the Forge arr stack: list the films you still need,
shortest first, and send selected batches to Radarr to search. Public hostname:
**sortarr.thescudders.org**, for allowlisted members signed in with Better
Auth. Unrelated to the Jaredharper1/Sortarr project.

## Development

Use Bun 1.4.4. Install the committed dependencies with
`bun install --frozen-lockfile`. This also installs the pre-commit hook.

Copy `.env.example` to `.env` and fill in the values; see
[Runtime configuration](#runtime-configuration). Start a disposable Postgres
for local work:

```sh
docker run -d --name sortarr-db -e POSTGRES_HOST_AUTH_METHOD=trust -p 5432:5432 postgres:18-alpine
docker exec sortarr-db createdb -U postgres sortarr
bun run db:migrate
bun run dev
```

Open **http://127.0.0.1:3210** and sign in with an address on
`AUTH_ALLOWED_EMAILS`. The Radarr API key stays on the server.

## Checks

See [CONTRIBUTING.md](CONTRIBUTING.md). In short:

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test       # needs TEST_DATABASE_URL pointing at a disposable Postgres
bun run build
bun run test:e2e   # provisions its own throwaway Postgres and member
```

`test:e2e` starts a throwaway Postgres (or uses `E2E_DATABASE_URL`), seeds a
verified member with a random password, then runs Playwright against the
production build and a fake Radarr. It never contacts a real Radarr or sends
email.

## Database

Drizzle owns the schema (`src/server/schema.ts`): Better Auth's `auth_*`
tables and `user_profile` for profile photos. Generate migrations with
`bun run db:generate` and commit them; never edit an applied migration.
Migrations are additive. Dropping a column takes two releases: stop using it,
then drop it.

The app connects with postgres.js v4. When PostgreSQL refuses a connection
because there are too many connections (`53300`), v4 retries until
`connect_timeout` has passed instead of failing at once. Every client here (the
app in `src/server/db.ts`, migrations, tests and the e2e harness) sets
`connect_timeout: 2`, so a refused connection fails in about 3 seconds rather
than leaving pages waiting.

## Deployment

Sortarr runs as a service in the udms Compose stack on Forge
(`kylescudder/docker-compose`, `udms/compose/udms/sortarr.yml`), on the
`udms_default` network next to Radarr. It is not a deploy-core app.

Merging to `main` runs CI, then publishes a multi-platform image to
`ghcr.io/kylescudder/sortarr` tagged `main` and `sha-<commit>`. To roll out a
release, run this on Forge from `udms/`:

```sh
docker --context colima compose pull sortarr
docker --context colima compose up -d sortarr
```

Roll back by pinning `image:` to a previous `sha-<commit>` tag. The
`forge-udms` Cloudflare Tunnel routes `sortarr.thescudders.org` to
`sortarr:3210`; the container publishes no host port. Better Auth is the only
gate. The stack also runs `sortarr-db` (Postgres 18, owner and restricted
runtime roles created on first start) and a `sortarr-migrate` one-shot that
applies migrations with the owner role before the app starts.

## Searching in Radarr

Only movies with `hasFile: false` are listed. By default the list shows
monitored, available films with known runtimes, shortest first. Runtime comes
from Radarr's metadata, not Emby's file duration. Unknown, zero and negative
runtimes are listed separately and sort last. To fill in missing runtimes,
refresh the film's metadata in Radarr.

Pick films by their sprocket rail (or **Pick this film** on the marquee), up to 20 at a time. Your picks print on a Scudder Picture House ticket: the total running time, its length in feet of 35mm (24 frames a second, 16 frames to the foot, so 90 ft a minute, from Radarr's whole-minute runtimes), and a six-digit serial derived from the picked titles, so the same films always print the same number. Choose **Search selected in Radarr** on the stub, then confirm. The
server re-reads the library to reject films downloaded in the meantime, then
sends `MoviesSearch` to Radarr. A receipt means Radarr accepted the search. It
does not mean a download started; check Radarr's Activity page. Searches must
come from the app's own origin (`APP_ORIGIN` in production).

## Search progress

Each film shows what Radarr is doing with it, read live from Radarr so it
survives a refresh and looks the same on every device: searching,
downloading (with percentage and time left), importing, grabbed, no release
found, or needs attention (Radarr's own warning). Sortarr records each search
it sends (who, which films, Radarr's command id) in `search_request`, because
Radarr doesn't record searches that find nothing. Statuses cover the past
week; the page polls every 5 seconds while anything is moving and every
minute otherwise, and reloads the backlog when a film finishes importing.

## Sign-in

Better Auth with password, email code, magic link and passkey, as in the other
house apps. There is no sign-up: an address on `AUTH_ALLOWED_EMAILS` gets an
account the first time it signs in by email code or magic link, and can set a
password later from Profile. The allowlist is checked on every request, so
removing an address revokes access immediately. Everything except
`/api/health` and the sign-in pages requires a signed-in member.

## Runtime configuration

| Variable                 | Required | Purpose                                                                               |
| ------------------------ | -------- | ------------------------------------------------------------------------------------- |
| `DATABASE_URL`           | yes      | Postgres connection for the runtime role                                              |
| `APP_ORIGIN`             | yes      | Public https origin: `https://sortarr.thescudders.org`                                |
| `BETTER_AUTH_URL`        | yes      | Must equal `APP_ORIGIN`                                                               |
| `BETTER_AUTH_SECRET`     | yes      | 32+ random characters, stable across releases                                         |
| `BREVO_API_KEY`          | yes      | Transactional email                                                                   |
| `AUTH_EMAIL_FROM`        | yes      | `sortarr@kylescudder.co.uk`                                                           |
| `AUTH_EMAIL_DAILY_LIMIT` | yes      | `40`                                                                                  |
| `AUTH_ALLOWED_EMAILS`    | yes      | Comma-separated addresses that may sign in                                            |
| `RADARR_URL`             | yes      | Radarr base URL, including any URL base. `http://radarr:7878` on Forge                |
| `RADARR_API_KEY`         | yes      | From Radarr → Settings → General → Security                                           |
| `HOST`                   | no       | Bind address: `127.0.0.1` by default, `0.0.0.0` in the image                          |
| `PORT`                   | no       | `3210`                                                                                |
| `SORTARR_REVISION`       | no       | Set by the image build. Reported by `/api/health` and the `X-Sortarr-Revision` header |

Errors name a missing variable, never its value. Never commit `.env`.
