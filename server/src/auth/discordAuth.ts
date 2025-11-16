import passport from 'passport';
import { Strategy as DiscordStrategy, Profile } from 'passport-discord';
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = process.env.DISCORD_CLIENT_ID!;
const CLIENT_SECRET = process.env.DISCORD_CLIENT_SECRET!;
const CALLBACK_URL = process.env.DISCORD_REDIRECT_URI!;
const JWT_SECRET = process.env.JWT_SECRET!;

passport.use(
    new DiscordStrategy(
        {
            clientID: CLIENT_ID,
            clientSecret: CLIENT_SECRET,
            callbackURL: CALLBACK_URL,
            scope: ['identify'],
        },
        (accessToken, refreshToken, profile: Profile, done) => {
            return done(null, profile);
        }
    )
);

passport.serializeUser((user, done) => {
    done(null, user);
});

passport.deserializeUser((obj, done) => {
    done(null, obj as Profile);
});

export const isAuthenticated = (
    req: Request,
    res: Response,
    next: NextFunction
) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ message: 'Unauthorized' });
};

export const generateToken = (user: Profile) => {
    return jwt.sign(
        {
            id: user.id,
            username: user.username,
            avatar: user.avatar ?? null,
        },
        JWT_SECRET,
        { expiresIn: '7d' }
    );
};
