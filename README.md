# Team Generator (Discord-authenticated)

> Lightweight squad builder focused on small community nights: pick from saved or temporary players, drag them into balanced sides, capture scores, and revisit recent matches. Available in English and French.

## Feature Snapshot

-   **Discord OAuth login** – we only store your Discord ID, username, and avatar; an HttpOnly cookie carries the seven-day JWT so scripts can’t steal it.
-   **Saved & temporary rosters** – permanent players live in SQLite; temporary ones stay local to the browser. Both lists support inline edits, drag-and-drop reordering, and “select all / clear all” toggles, plus 0‑10 skill ratings that better reflect a player’s range.
-   **Momentum-aware balancing** – recent matches (last 4h) nudge a player’s effective skill up/down, helping the algorithm keep squads fresh. Fresh sessions start with zero momentum, and the boost can be toggled off or scoped per game.
-   **Game-aware map picker** – optionally pick or roll a map for each match (Valorant, CS2, Rocket League, LoL, Overwatch 2, Siege). Users can ban maps per game, and history stores the chosen game/map for future reference.
-   **Drag-first team builder** – generate proposed teams, then drag players directly between columns (even to swap with a full roster). A fairness warning appears if skills drift too far apart.
-   **Match scoring history** – saving a match records both team rosters and scores. Any entry can be edited or deleted, and the same modal is used to capture results everywhere.
-   **Localization + GDPR** – English/French toggle, cookie consent banner, “delete everything” endpoint, and automatic inactive-user pruning keep the app compliant.
-   **Docker-ready** – one `docker compose up` brings up the API, client bundle, and reverse proxy.

## Tech Stack

-   **Frontend**: React 19 + Vite + TypeScript, Tailwind CSS v4, custom contexts (Auth, Language, Toast).
-   **Backend**: Node 20, Express, Passport (Discord), JWT, SQLite (`sqlite3`), cookie-based session for OAuth handshake.
-   **Infra**: Docker, Docker Compose, Nginx (serves static client + proxies `/api` to the server).

## Local Development

### Prerequisites

-   Node.js 20+
-   npm 10+
-   Discord application (register redirect URI `http://localhost:3000/api/auth/discord/callback`)

### Environment files

`server/.env` (example in repo):

```env
PORT=3000
DISCORD_CLIENT_ID=your-client-id
DISCORD_CLIENT_SECRET=your-client-secret
DISCORD_REDIRECT_URI=http://localhost:3000/api/auth/discord/callback
JWT_SECRET=super-secret-value
JWT_TTL_DAYS=7
DATABASE_URL=./data/database.sqlite
SESSION_SECRET=another-secret
CLIENT_URL=http://localhost:5173
SESSION_COOKIE_SECURE=false
COOKIE_NAME=tg_token
COOKIE_DOMAIN=
COOKIE_SECURE=false
COOKIE_MAX_AGE_DAYS=7
GDPR_RETENTION_DAYS=90
GDPR_RETENTION_CHECK_HOURS=24
```

`client/.env`:

```env
VITE_API_URL=http://localhost:3000
```

### Run it

```bash
# API
cd server
npm install
npm run dev

# Client (new shell)
cd client
npm install
npm run dev
```

-   API: `http://localhost:3000`
-   UI: `http://localhost:5173`

### GDPR data retention

-   `GDPR_RETENTION_DAYS` (default **90**) controls when an inactive Discord account is purged along with its matches/players. Set to `0` or a negative value to disable automatic cleanup (not recommended).
-   `GDPR_RETENTION_CHECK_HOURS` (default **24**) controls how often the cleanup job runs.
-   Activity is refreshed on every authenticated API call, so active users are never deleted automatically.
-   `JWT_TTL_DAYS` + `COOKIE_MAX_AGE_DAYS` keep browser sessions alive; set both lower if you want short-lived tokens.
-   `COOKIE_SECURE=true` (and `SESSION_COOKIE_SECURE=true`) should be enabled in production behind HTTPS so cookies are only sent over TLS. Provide `COOKIE_DOMAIN` if the API sits on a subdomain.

## Docker

### Dev stack (live reload)

Spin up both Vite and the Express API with file watchers using the dedicated compose file:

```bash
docker compose -f docker-compose.dev.yml up --build
```

-   API: `http://localhost:3000`
-   Vite dev server: `http://localhost:5173`
-   Source folders are bind-mounted, and node_modules live inside the containers to keep host folders clean.

### Production stack (Nginx + reverse proxy)

```bash
docker compose up --build
```

-   Nginx serves the built client at `http://localhost:8080` and proxies `/api/*` to the Express server.
-   SQLite data persists under `server/data/` thanks to the bind-mounted volume.

## API Summary

| Method                | Endpoint                     | Notes                                                        |
| --------------------- | ---------------------------- | ------------------------------------------------------------ |
| GET                   | `/api/auth/discord`          | Kick off OAuth                                               |
| GET                   | `/api/auth/discord/callback` | Finalize OAuth, issue JWT                                    |
| GET                   | `/api/user`                  | Current user (requires JWT)                                  |
| DELETE                | `/api/user`                  | Remove user + saved data (GDPR)                              |
| GET/POST/PATCH/DELETE | `/api/players`               | CRUD for saved players                                       |
| GET/POST/PATCH/DELETE | `/api/matches`               | List, store, update, delete match results (scores + rosters + map info) |
| GET/PUT               | `/api/maps/preferences`      | Fetch or persist per-game banned maps for the picker |

Browser clients must send `credentials: 'include'` so the HttpOnly `COOKIE_NAME` authentication cookie is attached to API calls; no `Authorization` header is necessary.

## Database (SQLite)

| Table     | Columns                                                                                 |
| --------- | --------------------------------------------------------------------------------------- |
| `users`   | `id`, `username`, `avatar`, `last_active`, `token_version`                              |
| `players` | `id`, `user_id`, `name`, `skill` (0‑10)                                                  |
| `matches` | `id`, `user_id`, `teamA`, `teamB`, `teamA_score`, `teamB_score`, `winner`, `game`, `map_name`, `created_at` |
| `map_preferences` | `user_id`, `preferences` (JSON blob of banned maps per title)                               |

Foreign keys cascade so GDPR deletion wipes dependent rows automatically.

## Scripts

| Location | Command           | Purpose             |
| -------- | ----------------- | ------------------- |
| server   | `npm run dev`     | Express + ts-node   |
|          | `npm run build`   | Compile to `dist/`  |
|          | `npm start`       | Run compiled server |
| client   | `npm run dev`     | Vite dev server     |
|          | `npm run build`   | Production bundle   |
|          | `npm run preview` | Preview prod build  |

---

We intentionally kept the feature set lean: optimize for quick team generation, drag-and-drop tweaks, and simple score tracking. Extend it however you like—Discord bot hooks, richer analytics, or new balancing strategies can all build on top of this foundation.
