import dotenv from 'dotenv';

dotenv.config();

const DEFAULT_CLIENT_URL = 'http://localhost:5173';

const parseBoolean = (value: string | undefined, fallback: boolean) => {
    if (value === undefined || value.trim() === '') {
        return fallback;
    }
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
    return fallback;
};

const resolveClientUrl = (value: string) => {
    try {
        return new URL(value);
    } catch {
        return new URL(DEFAULT_CLIENT_URL);
    }
};

const rawClientUrl =
    process.env.CLIENT_URL ||
    process.env.DISCORD_CLIENT_URL ||
    DEFAULT_CLIENT_URL;

const parsedClientUrl = resolveClientUrl(rawClientUrl);

const inferredSecure = parsedClientUrl.protocol === 'https:';

const derivedCookieDomain =
    parsedClientUrl.hostname === 'localhost' ||
    parsedClientUrl.hostname === '127.0.0.1'
        ? undefined
        : parsedClientUrl.hostname;

export const CLIENT_URL = rawClientUrl;
export const CLIENT_ORIGIN = parsedClientUrl.origin;

export const COOKIE_SECURE = parseBoolean(
    process.env.COOKIE_SECURE,
    inferredSecure
);

export const SESSION_COOKIE_SECURE = parseBoolean(
    process.env.SESSION_COOKIE_SECURE,
    inferredSecure
);

export const COOKIE_DOMAIN =
    process.env.COOKIE_DOMAIN && process.env.COOKIE_DOMAIN.trim() !== ''
        ? process.env.COOKIE_DOMAIN.trim()
        : derivedCookieDomain;
