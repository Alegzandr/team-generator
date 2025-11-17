import { allQuery, getQuery, runQuery } from '../db';
import {
    clearUserFriendRequests,
    deleteNetworkIfEmpty,
} from './networkService';

export interface StoredUser {
    id: string;
    username: string;
    avatar: string | null;
    token_version: number;
    xp_total?: number;
    network_id: string;
}

export interface UserUpsertInput {
    id: string;
    username: string;
    avatar: string | null;
}

export const upsertUser = async (user: UserUpsertInput) => {
    await runQuery(`INSERT OR IGNORE INTO networks (id) VALUES (?)`, [user.id]);
    await runQuery(
        `
        INSERT INTO users (id, username, avatar, network_id)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            username = excluded.username,
            avatar = excluded.avatar,
            last_active = CURRENT_TIMESTAMP
`,
        [user.id, user.username, user.avatar, user.id]
    );

    const record = await getUserById(user.id);
    if (!record) {
        throw new Error('Failed to load user after upsert');
    }
    return record;
};

export const getUserById = async (id: string) => {
    return getQuery<StoredUser>(
        `SELECT id, username, avatar, token_version, xp_total, network_id
         FROM users WHERE id = ?`,
        [id]
    );
};

export const deleteUserAndData = async (userId: string) => {
    const user = await getQuery<{ network_id: string }>(
        `SELECT network_id FROM users WHERE id = ?`,
        [userId]
    );
    if (!user) {
        return;
    }
    const networkId = user.network_id;
    const replacement = await getQuery<{ id: string }>(
        `SELECT id FROM users WHERE network_id = ? AND id != ? LIMIT 1`,
        [networkId, userId]
    );
    if (replacement) {
        await runQuery(`UPDATE players SET user_id = ? WHERE user_id = ?`, [
            replacement.id,
            userId,
        ]);
        await runQuery(`UPDATE matches SET user_id = ? WHERE user_id = ?`, [
            replacement.id,
            userId,
        ]);
    }
    await clearUserFriendRequests(userId);
    await runQuery('DELETE FROM users WHERE id = ?', [userId]);
    await deleteNetworkIfEmpty(networkId);
};

export const getUsers = async () => {
    return allQuery<StoredUser>(
        'SELECT id, username, avatar, token_version, xp_total, network_id FROM users',
        []
    );
};

export const deleteInactiveUsers = async (cutoffISO: string) => {
    const rows = await allQuery<{ id: string }>(
        `SELECT id FROM users WHERE DATETIME(last_active) <= DATETIME(?)`,
        [cutoffISO]
    );
    for (const row of rows) {
        await deleteUserAndData(row.id);
    }
    return rows.length;
};

export const touchUserActivity = async (userId: string) => {
    await runQuery(`UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE id = ?`, [
        userId,
    ]);
};
