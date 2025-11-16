import express from 'express';
import passport from 'passport';
import { generateToken } from '../auth/discordAuth';
import { upsertUser } from '../services/userService';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_URL =
    process.env.CLIENT_URL || process.env.DISCORD_CLIENT_URL || 'http://localhost:5173';

const router = express.Router();

router.get('/discord', passport.authenticate('discord'));

router.get(
    '/discord/callback',
    passport.authenticate('discord', { failureRedirect: '/' }),
    async (req, res) => {
        const user = req.user as any;
        const token = generateToken(user);
        await upsertUser({
            id: user.id,
            username: user.username,
            avatar: user.avatar ?? null,
        });
        res.redirect(`${CLIENT_URL}?token=${token}`);
    }
);

router.post('/logout', (req, res) => {
    req.logout(() => {
        res.json({ message: 'Logged out' });
    });
});

export default router;
