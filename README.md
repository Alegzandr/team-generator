# Team Generator (Discord-authenticated)

> Lightweight squad builder focused on small community nights: pick from saved or temporary players, drag them into balanced sides, capture scores, and revisit recent matches. Available in English and French.

## Feature Snapshot

-   **Discord OAuth login** – we only store your Discord ID, username, and avatar; JWT keeps the session alive for seven days.
-   **Saved & temporary rosters** – permanent players live in SQLite; temporary ones stay local to the browser. Both lists support inline edits, drag-and-drop reordering, and “select all / clear all” toggles.
-   **Momentum-aware balancing** – recent matches (last 4h) nudge a player’s effective skill up/down, helping the algorithm keep squads fresh. Fresh sessions start with zero momentum.
-   **Drag-first team builder** – generate proposed teams, then drag players directly between columns (even to swap with a full roster). A fairness warning appears if skills drift too far apart.
-   **Match scoring history** – saving a match records both team rosters and scores. Any entry can be edited or deleted, and the same modal is used to capture results everywhere.
-   **Localization + GDPR** – English/French toggle, cookie consent banner, and a “delete everything” endpoint keep the app compliant.
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
DATABASE_URL=./data/database.sqlite
SESSION_SECRET=another-secret
CLIENT_URL=http://localhost:5173
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
| GET/POST/PATCH/DELETE | `/api/matches`               | List, store, update, delete match results (scores + rosters) |

All non-OAuth routes expect `Authorization: Bearer <token>`.

## Database (SQLite)

| Table     | Columns                                                                                 |
| --------- | --------------------------------------------------------------------------------------- |
| `users`   | `id`, `username`, `avatar`                                                              |
| `players` | `id`, `user_id`, `name`, `skill`                                                        |
| `matches` | `id`, `user_id`, `teamA`, `teamB`, `teamA_score`, `teamB_score`, `winner`, `created_at` |

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
