import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { TOKEN_COOKIE_NAME } from '../config/authCookies';
import { TokenPayload } from '../auth/discordAuth';
import type { XpSummary } from './xpService';
import { allQuery } from '../db';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET!;

const userSockets = new Map<string, Set<WebSocket>>();

const parseCookies = (header?: string) => {
    const map: Record<string, string> = {};
    if (!header) {
        return map;
    }
    header.split(';').forEach((entry) => {
        const [rawKey, ...rest] = entry.split('=');
        if (!rawKey) return;
        const key = rawKey.trim();
        const value = rest.join('=').trim();
        if (key && value) {
            map[key] = decodeURIComponent(value);
        }
    });
    return map;
};

const registerSocket = (userId: string, socket: WebSocket) => {
    const existing = userSockets.get(userId);
    if (existing) {
        existing.add(socket);
    } else {
        userSockets.set(userId, new Set([socket]));
    }
    socket.on('close', () => {
        const set = userSockets.get(userId);
        if (!set) return;
        set.delete(socket);
        if (set.size === 0) {
            userSockets.delete(userId);
        }
    });
    socket.on('error', () => {
        socket.close();
    });
};

const emitToUser = (userId: string, payload: unknown) => {
    const sockets = userSockets.get(userId);
    if (!sockets || sockets.size === 0) {
        return;
    }
    const message = JSON.stringify(payload);
    sockets.forEach((socket) => {
        if (socket.readyState === WebSocket.OPEN) {
            socket.send(message);
        }
    });
};

const emitToUsers = (userIds: string[], payload: unknown) => {
    const unique = Array.from(new Set(userIds));
    unique.forEach((id) => emitToUser(id, payload));
};

const loadNetworkMemberIds = async (networkId: string) => {
    const rows = await allQuery<{ id: string }>(
        `SELECT id FROM users WHERE network_id = ?`,
        [networkId]
    );
    return rows.map((row) => row.id);
};

export const setupRealtimeServer = (server: http.Server) => {
    const wss = new WebSocketServer({ server, path: '/ws' });
    wss.on('connection', (socket, req) => {
        const cookies = parseCookies(req.headers.cookie);
        const token = cookies[TOKEN_COOKIE_NAME];
        if (!token) {
            socket.close(1008, 'Unauthorized');
            return;
        }
        try {
            const payload = jwt.verify(token, JWT_SECRET) as TokenPayload;
            registerSocket(payload.id, socket);
            socket.send(JSON.stringify({ type: 'connection:ack' }));
        } catch (error) {
            socket.close(1008, 'Unauthorized');
        }
    });
};

export const emitXpUpdate = (userId: string, summary: XpSummary) => {
    emitToUser(userId, { type: 'xp:update', payload: summary });
};

export const emitSocialUpdate = (targets: string | string[]) => {
    const list = Array.isArray(targets) ? targets : [targets];
    emitToUsers(list, { type: 'social:update' });
};

type SyncScope =
    | 'players'
    | 'matches'
    | 'network'
    | 'requests'
    | 'notifications';

const emitSync = (targets: string[], scope: SyncScope, meta?: Record<string, unknown>) => {
    emitToUsers(targets, { type: 'sync', scope, meta });
};

export const emitNetworkSync = async (
    networkId: string,
    scope: SyncScope,
    meta?: Record<string, unknown>
) => {
    const members = await loadNetworkMemberIds(networkId);
    if (!members.length) return;
    emitSync(members, scope, meta);
};

export const emitNotificationsUpdate = (targets: string | string[]) => {
    const list = Array.isArray(targets) ? targets : [targets];
    if (!list.length) return;
    emitSync(list, 'notifications');
};
