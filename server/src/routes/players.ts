import express from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import {
    createPlayer,
    deletePlayer,
    findPlayerByName,
    getPlayersForNetworkPaginated,
    updatePlayer,
} from '../services/playerService';
import {
    awardPlayerCreationXp,
    awardPlayerRemovalPenalty,
} from '../services/xpService';
import { emitNetworkSync } from '../services/realtimeService';
import { addNotification } from '../services/notificationService';
import { getNetworkMembers } from '../services/networkService';

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
        const result = await getPlayersForNetworkPaginated(
            req.authUser!.networkId,
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
        const existing = await findPlayerByName(req.authUser!.networkId, name.trim());
        if (existing) {
            res.status(409).json({ message: 'Player already exists in this network' });
            return;
        }
        const player = await createPlayer(req.authUser!.networkId, req.authUser!.id, {
            name: name.trim(),
            skill: skillValue,
        });
        if (!player) {
            res.status(500).json({ message: 'Failed to load player' });
            return;
        }
        const xp = await awardPlayerCreationXp(
            req.authUser!.id,
            req.authUser!.networkId,
            player.id
        );
        emitNetworkSync(req.authUser!.networkId, 'players', { action: 'create' }).catch(
            () => undefined
        );
        const members = await getNetworkMembers(req.authUser!.networkId);
        const recipients = members
            .filter((member) => member.id !== req.authUser!.id)
            .map((member) => member.id);
        if (recipients.length) {
            await addNotification(recipients, {
                type: 'player:create',
                data: {
                    playerName: player.name,
                    actor: req.authUser!.username,
                },
            });
        }
        res.status(201).json({ player, xp });
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
        const deleted = await deletePlayer(req.authUser!.networkId, playerId);
        if (!deleted) {
            res.status(404).json({ message: 'Player not found' });
            return;
        }
        const xp = await awardPlayerRemovalPenalty(
            req.authUser!.id,
            req.authUser!.networkId,
            playerId
        );
        emitNetworkSync(req.authUser!.networkId, 'players', { action: 'delete' }).catch(
            () => undefined
        );
        const members = await getNetworkMembers(req.authUser!.networkId);
        const recipients = members
            .filter((member) => member.id !== req.authUser!.id)
            .map((member) => member.id);
        if (recipients.length) {
            await addNotification(recipients, {
                type: 'player:remove',
                data: {
                    playerId,
                    actor: req.authUser!.username,
                },
            });
        }
        res.json({ xp });
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
        const existing = await findPlayerByName(req.authUser!.networkId, name.trim());
        if (existing && existing.id !== playerId) {
            res.status(409).json({ message: 'Player already exists in this network' });
            return;
        }
        const player = await updatePlayer(req.authUser!.networkId, playerId, {
            name: name.trim(),
            skill: skillValue,
        });
        if (!player) {
            res.status(404).json({ message: 'Player not found' });
            return;
        }
        emitNetworkSync(req.authUser!.networkId, 'players', { action: 'update' }).catch(
            () => undefined
        );
        const members = await getNetworkMembers(req.authUser!.networkId);
        const recipients = members
            .filter((member) => member.id !== req.authUser!.id)
            .map((member) => member.id);
        if (recipients.length) {
            await addNotification(recipients, {
                type: 'player:update',
                data: {
                    playerName: player.name,
                    actor: req.authUser!.username,
                },
            });
        }
        res.json(player);
    } catch (error) {
        res.status(500).json({ message: 'Failed to update player' });
    }
});

export default router;
