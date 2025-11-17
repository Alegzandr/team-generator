import { allQuery, getQuery, runQuery } from '../db';

export interface PlayerRecord {
    id: number;
    user_id: string;
    name: string;
    skill: number;
}

export const getPlayersForUser = async (userId: string) => {
    return allQuery<PlayerRecord>(
        `
        SELECT id, user_id, name, skill
        FROM players
        WHERE user_id = ?
        ORDER BY name COLLATE NOCASE ASC
    `,
        [userId]
    );
};

export const getPlayersForUserPaginated = async (
    userId: string,
    limit: number,
    offset: number
) => {
    const players = await allQuery<PlayerRecord>(
        `
        SELECT id, user_id, name, skill
        FROM players
        WHERE user_id = ?
        ORDER BY name COLLATE NOCASE ASC
        LIMIT ?
        OFFSET ?
    `,
        [userId, limit, offset]
    );
    const totalRow = await getQuery<{ count: number }>(
        `SELECT COUNT(*) as count FROM players WHERE user_id = ?`,
        [userId]
    );
    return {
        players,
        total: totalRow?.count ?? 0,
    };
};

export const createPlayer = async (
    userId: string,
    data: { name: string; skill: number }
) => {
    const result = await runQuery(
        `INSERT INTO players (user_id, name, skill) VALUES (?, ?, ?)`,
        [userId, data.name, data.skill]
    );

    return getQuery<PlayerRecord>('SELECT * FROM players WHERE id = ?', [
        result.lastID,
    ]);
};

export const deletePlayer = async (userId: string, playerId: number) => {
    await runQuery(`DELETE FROM players WHERE id = ? AND user_id = ?`, [
        playerId,
        userId,
    ]);
};

export const updatePlayer = async (
    userId: string,
    playerId: number,
    data: { name: string; skill: number }
) => {
    await runQuery(
        `UPDATE players SET name = ?, skill = ? WHERE id = ? AND user_id = ?`,
        [data.name, data.skill, playerId, userId]
    );
    return getQuery<PlayerRecord>(
        `SELECT id, user_id, name, skill FROM players WHERE id = ? AND user_id = ?`,
        [playerId, userId]
    );
};
