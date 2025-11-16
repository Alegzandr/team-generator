import { allQuery, getQuery, runQuery } from '../db';

export interface StoredUser {
    id: string;
    username: string;
    avatar: string | null;
}

export const upsertUser = async (user: StoredUser) => {
    await runQuery(
        `
        INSERT INTO users (id, username, avatar)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            username = excluded.username,
            avatar = excluded.avatar,
            last_active = CURRENT_TIMESTAMP
    `,
        [user.id, user.username, user.avatar]
    );
};

export const getUserById = async (id: string) => {
    return getQuery<StoredUser>('SELECT id, username, avatar FROM users WHERE id = ?', [
        id,
    ]);
};

export const deleteUserAndData = async (userId: string) => {
    await runQuery('DELETE FROM players WHERE user_id = ?', [userId]);
    await runQuery('DELETE FROM matches WHERE user_id = ?', [userId]);
    await runQuery('DELETE FROM users WHERE id = ?', [userId]);
};

export const getUsers = async () => {
    return allQuery<StoredUser>('SELECT id, username, avatar FROM users', []);
};

export const deleteInactiveUsers = async (cutoffISO: string) => {
    const result = await runQuery(
        `DELETE FROM users WHERE DATETIME(last_active) <= DATETIME(?)`,
        [cutoffISO]
    );
    return result.changes ?? 0;
};
