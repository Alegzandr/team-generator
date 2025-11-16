import dotenv from 'dotenv';
import { deleteInactiveUsers } from './userService';

dotenv.config();

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_CHECK_INTERVAL_HOURS = 24;

const readNumber = (value: string | undefined, fallback: number) => {
    if (value === undefined) {
        return fallback;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

export const purgeExpiredUserData = async (retentionDays: number) => {
    const cutoff = new Date(Date.now() - retentionDays * DAY_MS).toISOString();
    const deleted = await deleteInactiveUsers(cutoff);
    if (deleted > 0) {
        console.log(
            `[gdpr] Purged ${deleted} inactive user(s) older than ${retentionDays} day(s).`
        );
    }
};

export const startRetentionJob = () => {
    const retentionDays = readNumber(
        process.env.GDPR_RETENTION_DAYS,
        DEFAULT_RETENTION_DAYS
    );

    if (retentionDays <= 0) {
        console.log('[gdpr] Retention job disabled (GDPR_RETENTION_DAYS <= 0).');
        return;
    }

    const intervalHours = Math.max(
        readNumber(process.env.GDPR_RETENTION_CHECK_HOURS, DEFAULT_CHECK_INTERVAL_HOURS),
        1
    );
    const intervalMs = intervalHours * 60 * 60 * 1000;

    const runCleanup = () =>
        purgeExpiredUserData(retentionDays).catch((err) =>
            console.error('[gdpr] Failed to run retention job:', err)
        );

    runCleanup();
    const timer = setInterval(runCleanup, intervalMs);
    if (typeof timer.unref === 'function') {
        timer.unref();
    }
};
