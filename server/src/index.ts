import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import passport from 'passport';
import session from 'express-session';
import cookieParser from 'cookie-parser';
import createMemoryStore from 'memorystore';
import authRoutes from './routes/auth';
import playerRoutes from './routes/players';
import matchRoutes from './routes/matches';
import userRoutes from './routes/user';
import { startRetentionJob } from './services/retentionService';
import './auth/discordAuth';

dotenv.config();

const CLIENT_URL =
    process.env.CLIENT_URL ||
    process.env.DISCORD_CLIENT_URL ||
    'http://localhost:5173';

const MemoryStore = createMemoryStore(session);
const sessionStore = new MemoryStore({
    checkPeriod: 24 * 60 * 60 * 1000,
});

const app = express();

app.use(
    cors({
        origin: CLIENT_URL,
        credentials: true,
    })
);
app.use(cookieParser());
app.use(express.json());

const sessionCookieSecure =
    process.env.SESSION_COOKIE_SECURE === 'true' ||
    process.env.NODE_ENV === 'production';
const sessionCookieSameSite = sessionCookieSecure ? 'none' : 'lax';

app.use(
    session({
        secret: process.env.SESSION_SECRET!,
        resave: false,
        saveUninitialized: false,
        store: sessionStore,
        cookie: {
            maxAge: 10 * 60 * 1000,
            sameSite: sessionCookieSameSite,
            secure: sessionCookieSecure,
        },
    })
);

app.use(passport.initialize());
app.use(passport.session());

app.use('/api/auth', authRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/user', userRoutes);

startRetentionJob();

const PORT = process.env.PORT || 3000;
app.listen(PORT, () =>
    console.log(`Server running on http://localhost:${PORT}`)
);
