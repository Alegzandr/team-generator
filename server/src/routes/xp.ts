import express from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import {
    awardMatchScreenshotXp,
    awardReferralXp,
    awardTeamShareXp,
    getXpRewards,
    getXpSnapshot,
} from '../services/xpService';

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
    try {
        const snapshot = await getXpSnapshot(req.authUser!.id);
        res.json(snapshot);
    } catch (error) {
        res.status(500).json({ message: 'Failed to load XP state' });
    }
});

router.get('/rewards', (req, res) => {
    try {
        res.json(getXpRewards());
    } catch {
        res.status(500).json({ message: 'Failed to load XP rewards' });
    }
});

router.post('/events', async (req, res) => {
    const { type, payload } = req.body || {};
    if (type === 'team_share') {
        const signature = typeof payload?.signature === 'string' ? payload.signature : '';
        if (!signature || signature.length > 120) {
            res.status(400).json({ message: 'Invalid signature' });
            return;
        }
        try {
            const xp = await awardTeamShareXp(
                req.authUser!.id,
                req.authUser!.networkId,
                signature
            );
            res.json({ xp });
        } catch (error) {
            res.status(500).json({ message: 'Failed to award XP' });
        }
        return;
    }

    if (type === 'match_screenshot') {
        const matchId = Number(payload?.matchId);
        if (!Number.isFinite(matchId) || matchId <= 0) {
            res.status(400).json({ message: 'Invalid match id' });
            return;
        }
        try {
            const xp = await awardMatchScreenshotXp(
                req.authUser!.id,
                req.authUser!.networkId,
                matchId
            );
            res.json({ xp });
        } catch (error) {
            if (error instanceof Error && error.message === 'Match not found') {
                res.status(404).json({ message: 'Match not found' });
                return;
            }
            res.status(500).json({ message: 'Failed to award XP' });
        }
        return;
    }

    res.status(400).json({ message: 'Unknown XP event' });
});

router.post('/referrals/claim', async (req, res) => {
    const referrerId =
        typeof req.body?.referrerId === 'string' ? req.body.referrerId.trim() : '';
    if (!referrerId) {
        res.status(400).json({ message: 'Missing referrer id' });
        return;
    }
    if (referrerId === req.authUser!.id) {
        res.status(400).json({ message: 'Cannot refer yourself' });
        return;
    }

    try {
        const xp = await awardReferralXp(referrerId, req.authUser!.id);
        res.json({ credited: xp.delta > 0 });
    } catch (error) {
        if (error instanceof Error && error.message === 'Referrer not found') {
            res.status(404).json({ message: 'Referrer not found' });
            return;
        }
        res.status(500).json({ message: 'Failed to register referral' });
    }
});

export default router;
