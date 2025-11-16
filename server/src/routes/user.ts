import express from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { deleteUserAndData } from '../services/userService';
import { TOKEN_COOKIE_NAME, tokenCookieOptions } from '../config/authCookies';

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
    res.json(req.authUser);
});

router.delete('/', async (req, res) => {
    try {
        await deleteUserAndData(req.authUser!.id);
        req.session?.destroy(() => undefined);
        res.clearCookie(TOKEN_COOKIE_NAME, {
            ...tokenCookieOptions,
            maxAge: 0,
        });
        res.json({ message: 'Account deleted' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to delete user data' });
    }
});

export default router;
