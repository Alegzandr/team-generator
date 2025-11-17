import express from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import {
    createPlayer,
    deletePlayer,
    getPlayersForUserPaginated,
    updatePlayer,
} from '../services/playerService';

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
    const limitParam = Number(req.query.limit);
    const offsetParam = Number(req.query.offset);
    const limit = Number.isFinite(limitParam)
        ? Math.min(Math.max(limitParam, 1), 100)
        : 20;
    const offset = Number.isFinite(offsetParam) ? Math.max(offsetParam, 0) : 0;
    try {
        const result = await getPlayersForUserPaginated(
            req.authUser!.id,
            limit,
            offset
        );
        res.json(result);
    } catch (error) {
        res.status(500).json({ message: 'Failed to load players' });
    }
});

router.post('/', async (req, res) => {
    const { name, skill } = req.body || {};

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ message: 'Name is required' });
        return;
    }

    const skillValue = Number(skill);
    if (!Number.isInteger(skillValue) || skillValue < 0 || skillValue > 10) {
        res.status(400).json({ message: 'Skill must be between 0 and 10' });
        return;
    }

    try {
        const player = await createPlayer(req.authUser!.id, {
            name: name.trim(),
            skill: skillValue,
        });
        if (!player) {
            res.status(500).json({ message: 'Failed to load player' });
            return;
        }
        res.status(201).json(player);
    } catch (error) {
        res.status(500).json({ message: 'Failed to create player' });
    }
});

router.delete('/:id', async (req, res) => {
    const playerId = Number(req.params.id);
    if (Number.isNaN(playerId)) {
        res.status(400).json({ message: 'Invalid player id' });
        return;
    }

    try {
        await deletePlayer(req.authUser!.id, playerId);
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete player' });
    }
});

router.patch('/:id', async (req, res) => {
    const playerId = Number(req.params.id);
    const { name, skill } = req.body || {};

    if (Number.isNaN(playerId)) {
        res.status(400).json({ message: 'Invalid player id' });
        return;
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
        res.status(400).json({ message: 'Name is required' });
        return;
    }

    const skillValue = Number(skill);
    if (!Number.isInteger(skillValue) || skillValue < 0 || skillValue > 10) {
        res.status(400).json({ message: 'Skill must be between 0 and 10' });
        return;
    }

    try {
        const player = await updatePlayer(req.authUser!.id, playerId, {
            name: name.trim(),
            skill: skillValue,
        });
        if (!player) {
            res.status(404).json({ message: 'Player not found' });
            return;
        }
        res.json(player);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update player' });
    }
});

export default router;
