# Team Generator (Discord-authenticated)

> Lightweight squad builder focused on small community nights: pick from saved or temporary players, drag them into balanced sides, capture scores, and revisit recent matches. Available in English and French.

## Feature Snapshot

-   **Discord OAuth login** – we only store your Discord ID, username, and avatar; an HttpOnly cookie carries the seven‑day JWT so scripts can’t steal it.
-   **Friend networks & shared history** – send realtime friend requests, accept them, and automatically form a small “network”. Everyone in the same network shares saved players, match history, momentum, and XP. Networks do not have names; you simply see a compact network list in the header plus a “Leave network” button with confirmation.
-   **Saved & temporary rosters** – permanent players live in SQLite; temporary ones stay local to the browser. Both lists support inline edits, drag‑and‑drop reordering, select‑all/clear‑all, infinite scrolling, and 0–10 skill ratings.
-   **Momentum‑aware balancing** – recent matches (last 4h) nudge a player’s effective skill. Momentum is shared across the network, so every member benefits from the same session history.
-   **Game‑aware map picker** – pick or roll maps for Valorant, CS2, Rocket League, LoL, Overwatch 2, and Siege. Banned maps persist per game.
-   **Drag‑first team builder** – generate teams, then drag players between columns to refine. A fairness warning appears when skills drift too far apart.
-   **Clipboard‑ready screenshots** – share teams or match history entries with a single camera button.
-   **Match scoring history** – completed and canceled matches are recorded, editable, and shareable. Network members see a unified match history.
-   **XP, referrals & network actions** – XP is gained/lost for adding/removing network members, match activity, screenshots, roster actions, and referrals. XP changes stream in via WebSockets for all members.
-   **Social header UI** – shows pending friend requests, a network member list, and a user search for adding friends in realtime.
-   **Localization + GDPR** – English/French toggle, consent banner, data deletion, and automatic pruning of inactive users.
-   **Docker‑ready** – single `docker compose up` runs the API, client bundle, and reverse proxy.

## Tech Stack

-   **Frontend**: React 19 + Vite + TypeScript, Tailwind CSS v4, contexts (Auth, Language, Toast, Network/Social).
-   **Backend**: Node 20, Express, Passport (Discord), JWT, SQLite, WebSocket layer for XP + friend/network events.
-   **Infra**: Docker, Nginx (static client + `/api` proxy), robots.txt blocking API indexing.

## Local Development

### Prerequisites

-   Node 20+
-   npm 10+
-   Discord application (redirect URI `http://localhost:3000/api/auth/discord/callback`)

### Environment files

`server/.env`

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

`client/.env`

```env
VITE_API_URL=http://localhost:3000
```

### Run it

```bash
cd server && npm install && npm run dev
cd client && npm install && npm run dev
```

-   API: `http://localhost:3000`
-   UI: `http://localhost:5173`

## Docker

### Dev mode

```bash
docker compose -f docker-compose.dev.yml up --build
```

### Production

```bash
docker compose up --build
```

## API Summary

| Method                | Endpoint                            | Notes                                     |
| --------------------- | ----------------------------------- | ----------------------------------------- |
| GET                   | `/api/auth/discord`                 | Kick off OAuth                            |
| GET                   | `/api/auth/discord/callback`        | Finalize OAuth                            |
| GET                   | `/api/user`                         | Current user                              |
| DELETE                | `/api/user`                         | GDPR deletion                             |
| GET/POST/PATCH/DELETE | `/api/players`                      | CRUD players                              |
| GET/POST/PATCH/DELETE | `/api/matches`                      | CRUD matches (shared within network)      |
| GET/PUT               | `/api/maps/preferences`             | Map bans                                  |
| GET                   | `/api/xp`                           | XP total (network‑adjusted if in network) |
| GET                   | `/api/xp/rewards`                   | Reward table                              |
| POST                  | `/api/xp/events`                    | XP claim events                           |
| POST                  | `/api/xp/referrals/claim`           | Referral credits                          |
| GET                   | `/api/network`                      | Network snapshot                          |
| POST                  | `/api/network/leave`                | Leave network                             |
| GET                   | `/api/network/requests`             | List friend requests                      |
| POST                  | `/api/network/requests`             | Send friend request                       |
| POST                  | `/api/network/requests/:id/accept`  | Accept                                    |
| POST                  | `/api/network/requests/:id/decline` | Decline/cancel                            |
| GET                   | `/api/network/search`               | Search users                              |
| WebSocket             | `/ws`                               | XP + social updates                       |

## Database (SQLite)

| Table             | Columns                                                                       |
| ----------------- | ----------------------------------------------------------------------------- |
| `users`           | id, username, avatar, last_active, token_version, xp_total                    |
| `players`         | id, user_id, name, skill                                                      |
| `matches`         | id, user_id, teamA, teamB, scores, game, map_name, created_at, **network_id** |
| `map_preferences` | user_id, preferences                                                          |
| `xp_events`       | id, user_id, type, context, amount, created_at, **network_id**                |
| `referrals`       | id, referrer_id, referred_id, created_at                                      |
| `networks`        | id, created_at                                                                |
| `network_members` | network_id, user_id, joined_at, left_at                                       |
| `friend_requests` | id, from_user_id, to_user_id, status, created_at, responded_at                |

## Scripts

| Location | Command           | Purpose          |
| -------- | ----------------- | ---------------- |
| server   | `npm run dev`     | Dev server       |
| server   | `npm run build`   | Build            |
| server   | `npm start`       | Run built server |
| client   | `npm run dev`     | Vite dev         |
| client   | `npm run build`   | Production build |
| client   | `npm run preview` | Preview          |

---

This project now supports full small‑group networking: shared players, shared history, shared momentum, unified XP, and realtime social features.
