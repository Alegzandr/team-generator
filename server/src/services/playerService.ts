import { allQuery, getQuery, runQuery } from '../db';

export interface PlayerRecord {
    id: number;
    user_id: string;
    network_id: string;
    name: string;
    skill: number;
}

export const findPlayerByName = async (networkId: string, name: string) => {
    return getQuery<{ id: number }>(
        `SELECT id FROM players WHERE network_id = ? AND LOWER(name) = LOWER(?) LIMIT 1`,
        [networkId, name]
    );
};

export const getPlayersForNetwork = async (networkId: string) => {
    return allQuery<PlayerRecord>(
        `
        SELECT id, user_id, network_id, name, skill
        FROM players
        WHERE network_id = ?
        ORDER BY name COLLATE NOCASE ASC
    `,
        [networkId]
    );
};

export const getPlayersForNetworkPaginated = async (
    networkId: string,
    limit: number,
    offset: number
) => {
    const players = await allQuery<PlayerRecord>(
        `
        SELECT id, user_id, network_id, name, skill
        FROM players
        WHERE network_id = ?
        ORDER BY name COLLATE NOCASE ASC
        LIMIT ?
        OFFSET ?
    `,
        [networkId, limit, offset]
    );
    const totalRow = await getQuery<{ count: number }>(
        `SELECT COUNT(*) as count FROM players WHERE network_id = ?`,
        [networkId]
    );
    return {
        players,
        total: totalRow?.count ?? 0,
    };
};

export const createPlayer = async (
    networkId: string,
    userId: string,
    data: { name: string; skill: number }
) => {
    const result = await runQuery(
        `INSERT INTO players (user_id, network_id, name, skill) VALUES (?, ?, ?, ?)`,
        [userId, networkId, data.name, data.skill]
    );

    return getQuery<PlayerRecord>('SELECT * FROM players WHERE id = ?', [
        result.lastID,
    ]);
};

export const deletePlayer = async (networkId: string, playerId: number) => {
    const result = await runQuery(`DELETE FROM players WHERE id = ? AND network_id = ?`, [
        playerId,
        networkId,
    ]);
    return (result.changes ?? 0) > 0;
};

export const updatePlayer = async (
    networkId: string,
    playerId: number,
    data: { name: string; skill: number }
) => {
    await runQuery(
        `UPDATE players SET name = ?, skill = ? WHERE id = ? AND network_id = ?`,
        [data.name, data.skill, playerId, networkId]
    );
    return getQuery<PlayerRecord>(
        `SELECT id, user_id, network_id, name, skill FROM players WHERE id = ? AND network_id = ?`,
        [playerId, networkId]
    );
};
