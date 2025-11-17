import express from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import {
    acceptFriendRequest,
    clearUserFriendRequests,
    createIsolatedNetwork,
    deleteFriendRequest,
    deleteNetworkIfEmpty,
    getKickEligibleIds,
    getNetworkMembers,
    getNetworkState,
    moveUserToNetwork,
    searchNetworkCandidates,
    sendFriendRequest,
} from '../services/networkService';
import {
    awardNetworkMemberJoinXp,
    awardNetworkDepartureXp,
} from '../services/xpService';
import { emitNetworkSync, emitSocialUpdate } from '../services/realtimeService';
import { addNotification } from '../services/notificationService';

const router = express.Router();

router.use(requireAuth);

router.get('/state', async (req, res) => {
    try {
        const state = await getNetworkState(req.authUser!.networkId, req.authUser!.id);
        res.json(state);
    } catch (error) {
        res.status(500).json({ message: 'Failed to load network state' });
    }
});

router.get('/search', async (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q : '';
    if (query.trim().length < 2) {
        res.json([]);
        return;
    }
    try {
        const results = await searchNetworkCandidates(
            query,
            req.authUser!.id,
            req.authUser!.networkId
        );
        res.json(results);
    } catch (error) {
        res.status(500).json({ message: 'Failed to search users' });
    }
});

router.post('/requests', async (req, res) => {
    const targetId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
    if (!targetId) {
        res.status(400).json({ message: 'Missing user id' });
        return;
    }
    try {
        const request = await sendFriendRequest(req.authUser!.id, targetId);
        const state = await getNetworkState(req.authUser!.networkId, req.authUser!.id);
        emitSocialUpdate([req.authUser!.id, request.recipient.id]);
        emitNetworkSync(req.authUser!.networkId, 'requests').catch(() => undefined);
        if (request.recipient.networkId) {
            emitNetworkSync(request.recipient.networkId, 'requests').catch(() => undefined);
        }
        await addNotification(request.recipient.id, {
            type: 'network:friend_request',
            data: { actor: req.authUser!.username },
        });
        res.status(201).json({ state });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to send request';
        res.status(400).json({ message });
    }
});

router.post('/requests/:id/accept', async (req, res) => {
    const requestId = Number(req.params.id);
    if (!Number.isFinite(requestId)) {
        res.status(400).json({ message: 'Invalid request id' });
        return;
    }
    try {
        const result = await acceptFriendRequest(requestId, req.authUser!.id);
        const xp = await awardNetworkMemberJoinXp(
            req.authUser!.id,
            result.networkId,
            result.joinedUserId
        );
        req.authUser!.networkId = result.networkId;
        const state = await getNetworkState(result.networkId, req.authUser!.id);
        emitSocialUpdate(state.members.map((member) => member.id));
        emitNetworkSync(result.networkId, 'network').catch(() => undefined);
        emitNetworkSync(result.networkId, 'requests').catch(() => undefined);
        const recipients = state.members
            .filter((member) => member.id !== req.authUser!.id)
            .map((member) => member.id);
        if (recipients.length) {
            await addNotification(recipients, {
                type: 'network:member_join',
                data: { actor: req.authUser!.username },
            });
        }
        res.json({ state, xp });
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to accept';
        res.status(400).json({ message });
    }
});

router.delete('/requests/:id', async (req, res) => {
    const requestId = Number(req.params.id);
    if (!Number.isFinite(requestId)) {
        res.status(400).json({ message: 'Invalid request id' });
        return;
    }
    try {
        const otherUserId = await deleteFriendRequest(requestId, req.authUser!.id);
        if (!otherUserId) {
            res.status(404).json({ message: 'Request not found' });
            return;
        }
        const state = await getNetworkState(req.authUser!.networkId, req.authUser!.id);
        emitSocialUpdate([req.authUser!.id, otherUserId]);
        emitNetworkSync(req.authUser!.networkId, 'requests').catch(() => undefined);
        res.json({ state });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update request' });
    }
});

router.post('/leave', async (req, res) => {
    const confirmation = typeof req.body?.confirm === 'string' ? req.body.confirm.trim() : '';
    if (confirmation.toLowerCase() !== 'leave') {
        res.status(400).json({ message: 'Confirmation required' });
        return;
    }
    const currentNetworkId = req.authUser!.networkId;
    try {
        const members = await getNetworkMembers(currentNetworkId);
        const memberIds = members.map((member) => member.id);
        const xp = await awardNetworkDepartureXp(
            currentNetworkId,
            req.authUser!.id,
            req.authUser!.id
        );
        await clearUserFriendRequests(req.authUser!.id);
        const newNetworkId = await createIsolatedNetwork();
        await moveUserToNetwork(req.authUser!.id, newNetworkId);
        await deleteNetworkIfEmpty(currentNetworkId);
        req.authUser!.networkId = newNetworkId;
        const state = await getNetworkState(newNetworkId, req.authUser!.id);
        const oldMembers = memberIds.filter((id) => id !== req.authUser!.id);
        if (oldMembers.length) {
            await addNotification(oldMembers, {
                type: 'network:left',
                data: { actor: req.authUser!.username },
            });
            emitSocialUpdate(oldMembers);
        }
        emitNetworkSync(currentNetworkId, 'network', { action: 'leave' }).catch(
            () => undefined
        );
        emitSocialUpdate(req.authUser!.id);
        res.json({ state, xp });
    } catch (error) {
        res.status(500).json({ message: 'Failed to leave network' });
    }
});

router.post('/members/:id/kick', async (req, res) => {
    const targetId = typeof req.params.id === 'string' ? req.params.id : '';
    if (!targetId) {
        res.status(400).json({ message: 'Missing target id' });
        return;
    }
    if (targetId === req.authUser!.id) {
        res.status(400).json({ message: 'Cannot kick yourself' });
        return;
    }
    const networkId = req.authUser!.networkId;
    try {
        const eligible = await getKickEligibleIds(networkId);
        if (!eligible.has(req.authUser!.id)) {
            res.status(403).json({ message: 'Not allowed to kick members' });
            return;
        }
        const members = await getNetworkMembers(networkId);
        const target = members.find((member) => member.id === targetId);
        if (!target) {
            res.status(404).json({ message: 'Member not found' });
            return;
        }
        const memberIds = members.map((member) => member.id);
        const xp = await awardNetworkDepartureXp(networkId, targetId, req.authUser!.id);
        await clearUserFriendRequests(targetId);
        const isolatedId = await createIsolatedNetwork();
        await moveUserToNetwork(targetId, isolatedId);
        await deleteNetworkIfEmpty(networkId);
        const state = await getNetworkState(networkId, req.authUser!.id);
        const remaining = memberIds.filter((id) => id !== targetId);
        emitNetworkSync(networkId, 'network', { action: 'kick', targetId }).catch(
            () => undefined
        );
        emitSocialUpdate(remaining);
        emitSocialUpdate(targetId);
        await addNotification(targetId, {
            type: 'network:kicked',
            data: { actor: req.authUser!.username },
        });
        if (remaining.length) {
            await addNotification(remaining, {
                type: 'network:kick_notice',
                data: {
                    actor: req.authUser!.username,
                    target: target.username,
                },
            });
        }
        res.json({ state, xp });
    } catch (error) {
        res.status(500).json({ message: 'Failed to kick member' });
    }
});

export default router;
