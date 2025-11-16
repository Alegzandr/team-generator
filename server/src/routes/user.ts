import express from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { deleteUserAndData } from '../services/userService';

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
    res.json(req.authUser);
});

router.delete('/', async (req, res) => {
    try {
        await deleteUserAndData(req.authUser!.id);
        res.json({ message: 'Account deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete user data' });
    }
});

export default router;
