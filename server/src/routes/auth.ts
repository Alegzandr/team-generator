import express from 'express';
import passport from 'passport';
import { generateToken } from '../auth/discordAuth';
import { upsertUser } from '../services/userService';
import dotenv from 'dotenv';
import { tokenCookieOptions, TOKEN_COOKIE_NAME } from '../config/authCookies';

dotenv.config();

const CLIENT_URL =
    process.env.CLIENT_URL || process.env.DISCORD_CLIENT_URL || 'http://localhost:5173';

const router = express.Router();

router.get('/discord', passport.authenticate('discord'));

router.get(
    '/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    async (req, res) => {
        const user = req.user as { id: string; username: string; avatar?: string | null };
        const stored = await upsertUser({
            id: user.id,
            username: user.username,
            avatar: user.avatar ?? null,
        });
        const token = generateToken({
            id: stored.id,
            username: stored.username,
            avatar: stored.avatar,
            tokenVersion: stored.token_version,
        });
        res.cookie(TOKEN_COOKIE_NAME, token, tokenCookieOptions);
        res.redirect(CLIENT_URL);
    }
);

router.post('/logout', (req, res) => {
    const finalize = () => {
        res.clearCookie(TOKEN_COOKIE_NAME, {
            ...tokenCookieOptions,
            maxAge: 0,
        });
        res.json({ message: 'Logged out' });
    };

    if (req.session && req.logout) {
        req.logout(() => {
            req.session?.destroy(() => undefined);
            finalize();
        });
        return;
    }

    finalize();
});

export default router;
