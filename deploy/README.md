# Run alongside the arr stack

Set `.env` with the Radarr address reachable **from the container** and its API key, then run:

```sh
docker compose config --quiet
docker compose up -d --build
```

The supplied Compose file publishes only to the host's loopback address. On Docker Desktop, use `http://host.docker.internal:7878` for a host-published Radarr. For a shared Docker network, attach this service to that network and use `http://radarr:7878`. Include Radarr's URL base if configured. No media volume or database is needed.

For remote access, connect through your existing authenticated reverse proxy or a private tunnel. This version has no app login, so do not publish its port on a public interface. Preserve the request's public Host and Origin when proxying: search requests require a matching Origin. Do not inject the Radarr key into browser headers or frontend build variables.

Standalone production: `bun run build && bun run start`. Bun reads `.env` automatically. Restart after changing the connection settings. Never commit `.env`.

The existing stack has not been changed or deployed by this project. Validate the container network and make one deliberate search against your Radarr after installing.
