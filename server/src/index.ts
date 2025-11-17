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
import mapPreferenceRoutes from './routes/mapPreferences';
import xpRoutes from './routes/xp';
import socialRoutes from './routes/social';
import notificationRoutes from './routes/notifications';
import { startRetentionJob } from './services/retentionService';
import { setupRealtimeServer } from './services/realtimeService';
import './auth/discordAuth';
import {
    CLIENT_ORIGIN,
    SESSION_COOKIE_SECURE,
} from './config/environment';

dotenv.config();

const MemoryStore = createMemoryStore(session);
const sessionStore = new MemoryStore({
    checkPeriod: 24 * 60 * 60 * 1000,
});

const app = express();
app.set('trust proxy', 1);

app.use(
    cors({
        origin: CLIENT_ORIGIN,
        credentials: true,
    })
);
app.use(cookieParser());
app.use(express.json());

const sessionCookieSameSite = SESSION_COOKIE_SECURE ? 'none' : 'lax';

app.use(
    session({
        secret: process.env.SESSION_SECRET!,
        resave: false,
        saveUninitialized: false,
        store: sessionStore,
        cookie: {
            maxAge: 10 * 60 * 1000,
            sameSite: sessionCookieSameSite,
            secure: SESSION_COOKIE_SECURE,
        },
    })
);

app.use(passport.initialize());
app.use(passport.session());

app.use('/api/auth', authRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/matches', matchRoutes);
app.use('/api/user', userRoutes);
app.use('/api/maps/preferences', mapPreferenceRoutes);
app.use('/api/xp', xpRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/notifications', notificationRoutes);

startRetentionJob();

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () =>
    console.log(`Server running on http://localhost:${PORT}`)
);

setupRealtimeServer(server);
