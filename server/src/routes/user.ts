import express from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { deleteUserAndData, setBadgeVisibility } from '../services/userService';
import { TOKEN_COOKIE_NAME, tokenCookieOptions } from '../config/authCookies';

const router = express.Router();

router.use(requireAuth);

router.get('/', (req, res) => {
    res.json(req.authUser);
});

router.patch('/badges', async (req, res) => {
    const visible =
        typeof req.body?.visible === 'boolean' ? req.body.visible : req.body?.visible === 'true';
    try {
        const updated = await setBadgeVisibility(req.authUser!.id, Boolean(visible));
        if (!updated) {
            res.status(404).json({ message: 'User not found' });
            return;
        }
        req.authUser!.badgesVisibleInSearch = Boolean(updated.badges_visible_in_search);
        res.json({ badgesVisibleInSearch: Boolean(updated.badges_visible_in_search) });
    } catch (error) {
        res.status(500).json({ message: 'Failed to update badges' });
    }
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
