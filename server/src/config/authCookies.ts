import type { CookieOptions } from 'express';
import {
    COOKIE_DOMAIN,
    COOKIE_SECURE,
} from './environment';

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
const sameSite: CookieOptions['sameSite'] = COOKIE_SECURE ? 'none' : 'lax';
const cookieMaxAgeDays = readNumber(process.env.COOKIE_MAX_AGE_DAYS, 7);

export const tokenCookieOptions: CookieOptions = {
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite,
    domain: COOKIE_DOMAIN,
    maxAge: cookieMaxAgeDays * DAY_MS,
    path: '/',
};
