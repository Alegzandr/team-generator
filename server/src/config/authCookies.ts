import type { CookieOptions } from 'express';
import dotenv from 'dotenv';

dotenv.config();

const DAY_MS = 24 * 60 * 60 * 1000;

const readNumber = (value: string | undefined, fallback: number) => {
    if (value === undefined) return fallback;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
};

export const TOKEN_COOKIE_NAME = process.env.COOKIE_NAME || 'tg_token';
const cookieDomain = process.env.COOKIE_DOMAIN || undefined;
const cookieSecure =
    process.env.COOKIE_SECURE === 'true' ||
    process.env.NODE_ENV === 'production';

const sameSite: CookieOptions['sameSite'] = cookieSecure ? 'none' : 'lax';
const cookieMaxAgeDays = readNumber(process.env.COOKIE_MAX_AGE_DAYS, 7);

export const tokenCookieOptions: CookieOptions = {
    httpOnly: true,
    secure: cookieSecure,
    sameSite,
    domain: cookieDomain,
    maxAge: cookieMaxAgeDays * DAY_MS,
    path: '/',
};
