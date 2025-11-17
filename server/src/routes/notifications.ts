import express from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import {
    deleteNotification,
    listNotifications,
    markNotificationRead,
} from '../services/notificationService';

const router = express.Router();

router.use(requireAuth);

router.get('/', async (req, res) => {
    try {
        const notifications = await listNotifications(req.authUser!.id);
        res.json(notifications);
    } catch (error) {
        res.status(500).json({ message: 'Failed to load notifications' });
    }
});

router.patch('/:id/read', async (req, res) => {
    const notificationId = Number(req.params.id);
    const read = typeof req.body?.read === 'boolean' ? req.body.read : true;
    if (Number.isNaN(notificationId)) {
        res.status(400).json({ message: 'Invalid notification id' });
        return;
    }
    try {
        const updated = await markNotificationRead(req.authUser!.id, notificationId, read);
        if (!updated) {
            res.status(404).json({ message: 'Notification not found' });
            return;
        }
        res.json({ ok: true });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update notification' });
    }
});

router.delete('/:id', async (req, res) => {
    const notificationId = Number(req.params.id);
    if (Number.isNaN(notificationId)) {
        res.status(400).json({ message: 'Invalid notification id' });
        return;
    }
    try {
        const removed = await deleteNotification(req.authUser!.id, notificationId);
        if (!removed) {
            res.status(404).json({ message: 'Notification not found' });
            return;
        }
        res.status(204).send();
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete notification' });
    }
});

export default router;
