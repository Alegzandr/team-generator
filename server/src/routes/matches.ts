import express from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import {
    MatchRecord,
    TeamPlayer,
    createMatch,
    deleteMatch,
    getMatchesForNetwork,
    updateMatchWinner,
} from '../services/matchService';
import { awardMatchCompletionXp, type XpSummary } from '../services/xpService';
import { emitNetworkSync } from '../services/realtimeService';
import { addNotification } from '../services/notificationService';
import { getNetworkMembers } from '../services/networkService';

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
        const matches = await getMatchesForNetwork(req.authUser!.networkId);
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
    const { teamA, teamB, teamA_score, teamB_score, game, map, status, features } =
        req.body || {};
    if (!validateTeamPlayers(teamA) || !validateTeamPlayers(teamB)) {
        res.status(400).json({ message: 'Invalid teams payload' });
        return;
    }

    const scoreA = Number(teamA_score ?? 0);
    const scoreB = Number(teamB_score ?? 0);
    const normalizedStatus = status === 'canceled' ? 'canceled' : 'completed';
    const winner = normalizedStatus === 'canceled' ? 'unknown' : normalizeWinner(scoreA, scoreB);
    const normalizedGame =
        typeof game === 'string' && game.trim().length > 0 ? game.trim() : null;
    const normalizedMap =
        typeof map === 'string' && map.trim().length > 0 ? map.trim() : null;

    const normalizedFeatures = {
        mapSelection: Boolean(features?.mapSelection),
        momentum: Boolean(features?.momentum),
    };

    try {
        const match = await createMatch(req.authUser!.networkId, req.authUser!.id, {
            teamA,
            teamB,
            winner,
            teamA_score: scoreA,
            teamB_score: scoreB,
            game: normalizedGame,
            map: normalizedMap,
            status: normalizedStatus,
        });
        let xp: XpSummary | undefined;
        if (normalizedStatus === 'completed') {
            xp = await awardMatchCompletionXp(
                req.authUser!.id,
                req.authUser!.networkId,
                match.id,
                normalizedFeatures
            );
        }
        emitNetworkSync(req.authUser!.networkId, 'matches', {
            action: 'create',
            matchId: match.id,
        }).catch(() => undefined);
        const members = await getNetworkMembers(req.authUser!.networkId);
        const recipients = members
            .filter((member) => member.id !== req.authUser!.id)
            .map((member) => member.id);
        if (recipients.length) {
            await addNotification(recipients, {
                type: 'match:create',
                data: {
                    actor: req.authUser!.username,
                    status: match.status,
                    game: match.game,
                },
            });
        }
        res.status(201).json({ match, xp });
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
            req.authUser!.networkId,
            matchId,
            normalizedWinner,
            { teamA: scoreA, teamB: scoreB }
        );
        emitNetworkSync(req.authUser!.networkId, 'matches', {
            action: 'update',
            matchId,
        }).catch(() => undefined);
        const members = await getNetworkMembers(req.authUser!.networkId);
        const recipients = members
            .filter((member) => member.id !== req.authUser!.id)
            .map((member) => member.id);
        if (recipients.length) {
            await addNotification(recipients, {
                type: 'match:update',
                data: {
                    actor: req.authUser!.username,
                    matchId,
                },
            });
        }
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
        const deleted = await deleteMatch(req.authUser!.networkId, matchId);
        if (!deleted) {
            res.status(404).json({ message: 'Match not found' });
            return;
        }
        emitNetworkSync(req.authUser!.networkId, 'matches', {
            action: 'delete',
            matchId,
        }).catch(() => undefined);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete match' });
    }
};

router.delete('/:id', deleteHandler);
router.post('/:id/delete', deleteHandler);

export default router;
