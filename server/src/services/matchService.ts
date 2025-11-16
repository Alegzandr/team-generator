import { allQuery, getQuery, runQuery } from '../db';

export type TeamPlayer = {
    id?: number;
    name: string;
    skill: number;
    temporary?: boolean;
};

export interface MatchRecord {
    id: number;
    user_id: string;
    teamA: TeamPlayer[];
    teamB: TeamPlayer[];
    teamA_score: number;
    teamB_score: number;
    winner: 'teamA' | 'teamB' | 'unknown';
    created_at: string;
    game: string | null;
    map: string | null;
}

interface MatchRow {
    id: number;
    user_id: string;
    teamA: string;
    teamB: string;
    teamA_score: number;
    teamB_score: number;
    winner: 'teamA' | 'teamB' | 'unknown';
    game: string | null;
    map_name: string | null;
    created_at: string;
}

const parseRow = (row: MatchRow): MatchRecord => ({
    id: row.id,
    user_id: row.user_id,
    teamA: JSON.parse(row.teamA),
    teamB: JSON.parse(row.teamB),
    teamA_score: row.teamA_score ?? 0,
    teamB_score: row.teamB_score ?? 0,
    winner: row.winner,
    created_at: row.created_at,
    game: row.game ?? null,
    map: row.map_name ?? null,
});

export const createMatch = async (
    userId: string,
    data: {
        teamA: TeamPlayer[];
        teamB: TeamPlayer[];
        winner?: string;
        teamA_score?: number;
        teamB_score?: number;
        game?: string | null;
        map?: string | null;
    }
) => {
    const winner = (data.winner as MatchRecord['winner']) || 'unknown';
    const teamA_score = Number(data.teamA_score || 0);
    const teamB_score = Number(data.teamB_score || 0);
    const game = data.game ?? null;
    const mapName = data.map ?? null;
    const result = await runQuery(
        `INSERT INTO matches (user_id, teamA, teamB, teamA_score, teamB_score, winner, game, map_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            userId,
            JSON.stringify(data.teamA),
            JSON.stringify(data.teamB),
            teamA_score,
            teamB_score,
            winner,
            game,
            mapName,
        ]
    );

    const row = await getQuery<MatchRow>('SELECT * FROM matches WHERE id = ?', [
        result.lastID,
    ]);

    if (!row) {
        throw new Error('Unable to load inserted match');
    }

    return parseRow(row);
};

export const getMatchesForUser = async (userId: string) => {
    const rows = await allQuery<MatchRow>(
        `
        SELECT id, user_id, teamA, teamB, teamA_score, teamB_score, winner, game, map_name, created_at
        FROM matches
        WHERE user_id = ?
        ORDER BY datetime(created_at) DESC
    `,
        [userId]
    );

    return rows.map(parseRow);
};

export const updateMatchWinner = async (
    userId: string,
    matchId: number,
    winner: MatchRecord['winner'],
    scores?: { teamA: number; teamB: number }
) => {
    const teamA_score = Number(scores?.teamA ?? 0);
    const teamB_score = Number(scores?.teamB ?? 0);
    await runQuery(
        `UPDATE matches SET winner = ?, teamA_score = ?, teamB_score = ? WHERE id = ? AND user_id = ?`,
        [winner, teamA_score, teamB_score, matchId, userId]
    );
    const row = await getQuery<MatchRow>(
        `SELECT id, user_id, teamA, teamB, teamA_score, teamB_score, winner, game, map_name, created_at FROM matches WHERE id = ? AND user_id = ?`,
        [matchId, userId]
    );
    if (!row) {
        throw new Error('Match not found');
    }
    return parseRow(row);
};

export const deleteMatch = async (userId: string, matchId: number) => {
    const existing = await getQuery<{ id: number }>(
        `SELECT id FROM matches WHERE id = ? AND user_id = ?`,
        [matchId, userId]
    );
    if (!existing) {
        return false;
    }
    await runQuery(`DELETE FROM matches WHERE id = ? AND user_id = ?`, [
        matchId,
        userId,
    ]);
    return true;
};
