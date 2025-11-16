import express from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import {
    MatchRecord,
    TeamPlayer,
    createMatch,
    deleteMatch,
    getMatchesForUser,
    updateMatchWinner,
} from '../services/matchService';

const router = express.Router();

router.use(requireAuth);

const validateTeamPlayers = (players: unknown): players is TeamPlayer[] => {
    if (!Array.isArray(players)) return false;
    return players.every(
        (player) =>
            player &&
            typeof player.name === 'string' &&
            typeof player.skill === 'number'
    );
};

router.get('/', async (req, res) => {
    try {
        const matches = await getMatchesForUser(req.authUser!.id);
        res.json(matches);
    } catch (error) {
        res.status(500).json({ message: 'Failed to load matches' });
    }
});

const normalizeWinner = (
    teamAScore: number,
    teamBScore: number
): MatchRecord['winner'] => {
    if (teamAScore === teamBScore) return 'unknown';
    return teamAScore > teamBScore ? 'teamA' : 'teamB';
};

router.post('/', async (req, res) => {
    const { teamA, teamB, teamA_score, teamB_score } = req.body || {};
    if (!validateTeamPlayers(teamA) || !validateTeamPlayers(teamB)) {
        res.status(400).json({ message: 'Invalid teams payload' });
        return;
    }

    const scoreA = Number(teamA_score ?? 0);
    const scoreB = Number(teamB_score ?? 0);
    const winner = normalizeWinner(scoreA, scoreB);

    try {
        const match = await createMatch(req.authUser!.id, {
            teamA,
            teamB,
            winner,
            teamA_score: scoreA,
            teamB_score: scoreB,
        });
        res.status(201).json(match);
    } catch (error) {
        res.status(500).json({ message: 'Failed to save match' });
    }
});

router.patch('/:id', async (req, res) => {
    const matchId = Number(req.params.id);
    if (Number.isNaN(matchId)) {
        res.status(400).json({ message: 'Invalid match id' });
        return;
    }

    const { teamA_score, teamB_score } = req.body || {};
    const scoreA = Number(teamA_score ?? 0);
    const scoreB = Number(teamB_score ?? 0);
    const normalizedWinner = normalizeWinner(scoreA, scoreB);

    try {
        const match = await updateMatchWinner(
            req.authUser!.id,
            matchId,
            normalizedWinner,
            { teamA: scoreA, teamB: scoreB }
        );
        res.json(match);
    } catch (error) {
        if (error instanceof Error && error.message === 'Match not found') {
            res.status(404).json({ message: 'Match not found' });
            return;
        }
        res.status(500).json({ message: 'Failed to update match' });
    }
});

const deleteHandler = async (req: express.Request, res: express.Response) => {
    const matchId = Number(req.params.id);
    if (Number.isNaN(matchId)) {
        res.status(400).json({ message: 'Invalid match id' });
        return;
    }
    try {
        const deleted = await deleteMatch(req.authUser!.id, matchId);
        if (!deleted) {
            res.status(404).json({ message: 'Match not found' });
            return;
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete match' });
    }
};

router.delete('/:id', deleteHandler);
router.post('/:id/delete', deleteHandler);

export default router;
