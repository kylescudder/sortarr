# Sortarr

A Radarr backlog browser for the Forge arr stack: list the films you still need,
shortest first, and send selected batches to Radarr to search. Public hostname:
**sortarr.thescudders.org** (behind the stack's Cloudflare Access app). Unrelated
to the Jaredharper1/Sortarr project.

## Development

Use Bun 1.4.4. Install the committed dependencies with
`bun install --frozen-lockfile`. This also installs the pre-commit hook.

Copy `.env.example` to `.env` and set `RADARR_URL` and `RADARR_API_KEY`; see
[Runtime configuration](#runtime-configuration). There is no database: Radarr
is the source of truth.

```sh
bun run dev
```

Open **http://127.0.0.1:3210**. The API key stays on the server.

## Checks

See [CONTRIBUTING.md](CONTRIBUTING.md). In short:

```sh
bun run format:check
bun run lint
bun run typecheck
bun run test
bun run build
bun run test:e2e   # after the build; install Chromium once with bunx --no-install playwright install chromium
```

The Playwright suite runs the production build against a fake Radarr on ports
43210 and 43211. It never contacts a real Radarr or downloads anything.

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
`sortarr:3210`. The `Forge UDMS arr stack` Access application protects it, so
Sortarr has no login of its own and must never publish a host port.

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

## Runtime configuration

| Variable           | Required   | Purpose                                                                               |
| ------------------ | ---------- | ------------------------------------------------------------------------------------- |
| `RADARR_URL`       | yes        | Radarr base URL, including any URL base. `http://radarr:7878` on Forge                |
| `RADARR_API_KEY`   | yes        | From Radarr → Settings → General → Security                                           |
| `APP_ORIGIN`       | production | Public https origin that searches must come from: `https://sortarr.thescudders.org`   |
| `HOST`             | no         | Bind address: `127.0.0.1` by default, `0.0.0.0` in the image                          |
| `PORT`             | no         | `3210`                                                                                |
| `SORTARR_REVISION` | no         | Set by the image build. Reported by `/api/health` and the `X-Sortarr-Revision` header |

Errors name a missing variable, never its value. Never commit `.env`.
