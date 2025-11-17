import { randomUUID } from 'crypto';
import { getQuery, runQuery } from '../db';
import { emitXpUpdate } from './realtimeService';

const XP_VALUES = {
    MATCH_BASE: 50,
    MATCH_MAP_BONUS: 20,
    MATCH_MOMENTUM_BONUS: 15,
    TEAM_SHARE: 15,
    MATCH_SCREENSHOT: 12,
    PLAYER_CREATE: 8,
    PLAYER_REMOVE: -5,
    REFERRAL: 150,
};

const isUniqueConstraintError = (error: unknown) =>
    error instanceof Error && error.message.includes('UNIQUE constraint failed');

const loadXpTotal = async (userId: string) => {
    const row = await getQuery<{ xp_total: number }>(
        `SELECT xp_total FROM users WHERE id = ?`,
        [userId]
    );
    return row?.xp_total ?? 0;
};

interface EventDescriptor {
    amount: number;
    type: string;
    context?: string;
}

interface ApplyResult {
    applied: boolean;
    total: number;
    delta: number;
}

export interface XpBreakdownEntry {
    type: string;
    amount: number;
}

export interface XpSummary {
    total: number;
    delta: number;
    breakdown: XpBreakdownEntry[];
}

const applyEvent = async (
    userId: string,
    event: EventDescriptor,
    currentTotal: number
): Promise<ApplyResult> => {
    const context = event.context ?? randomUUID();
    const nextTotal = Math.max(0, currentTotal + event.amount);
    const appliedDelta = nextTotal - currentTotal;

    try {
        await runQuery(
            `INSERT INTO xp_events (user_id, type, context, amount) VALUES (?, ?, ?, ?)`,
            [userId, event.type, context, appliedDelta]
        );
    } catch (error) {
        if (isUniqueConstraintError(error)) {
            return { applied: false, total: currentTotal, delta: 0 };
        }
        throw error;
    }

    if (appliedDelta !== 0) {
        await runQuery(`UPDATE users SET xp_total = ? WHERE id = ?`, [
            nextTotal,
            userId,
        ]);
    }

    return { applied: true, total: nextTotal, delta: appliedDelta };
};

const runEvents = async (
    userId: string,
    events: EventDescriptor[]
): Promise<XpSummary> => {
    const breakdown: XpBreakdownEntry[] = [];
    if (!events.length) {
        const baseline = await loadXpTotal(userId);
        return { total: baseline, delta: 0, breakdown };
    }
    let total = await loadXpTotal(userId);
    let deltaSum = 0;

    for (const event of events) {
        const result = await applyEvent(userId, event, total);
        if (result.applied && result.delta !== 0) {
            breakdown.push({ type: event.type, amount: result.delta });
            total = result.total;
            deltaSum += result.delta;
        } else if (result.applied) {
            total = result.total;
        }
    }

    const summary: XpSummary = { total, delta: deltaSum, breakdown };
    if (deltaSum !== 0) {
        emitXpUpdate(userId, summary);
    }
    return summary;
};

export const getXpSnapshot = async (userId: string) => {
    const xp = await loadXpTotal(userId);
    return { xp };
};

export const awardMatchCompletionXp = async (
    userId: string,
    matchId: number,
    options: { mapSelection?: boolean; momentum?: boolean }
) => {
    const events: EventDescriptor[] = [
        {
            amount: XP_VALUES.MATCH_BASE,
            type: 'match:completed',
            context: `match:${matchId}:base`,
        },
    ];
    if (options.mapSelection) {
        events.push({
            amount: XP_VALUES.MATCH_MAP_BONUS,
            type: 'match:map',
            context: `match:${matchId}:map`,
        });
    }
    if (options.momentum) {
        events.push({
            amount: XP_VALUES.MATCH_MOMENTUM_BONUS,
            type: 'match:momentum',
            context: `match:${matchId}:momentum`,
        });
    }
    return runEvents(userId, events);
};

export const awardPlayerCreationXp = async (userId: string, playerId: number) => {
    return runEvents(userId, [
        {
            amount: XP_VALUES.PLAYER_CREATE,
            type: 'player:create',
            context: `player:${playerId}:create`,
        },
    ]);
};

export const awardPlayerRemovalPenalty = async (
    userId: string,
    playerId: number
) => {
    return runEvents(userId, [
        {
            amount: XP_VALUES.PLAYER_REMOVE,
            type: 'player:remove',
            context: `player:${playerId}:remove:${randomUUID()}`,
        },
    ]);
};

export const awardTeamShareXp = async (userId: string, signature: string) => {
    return runEvents(userId, [
        {
            amount: XP_VALUES.TEAM_SHARE,
            type: 'share:team',
            context: `teamshare:${signature}`,
        },
    ]);
};

export const awardMatchScreenshotXp = async (
    userId: string,
    matchId: number
) => {
    const match = await getQuery<{ id: number }>(
        `SELECT id FROM matches WHERE id = ? AND user_id = ?`,
        [matchId, userId]
    );
    if (!match) {
        throw new Error('Match not found');
    }
    return runEvents(userId, [
        {
            amount: XP_VALUES.MATCH_SCREENSHOT,
            type: 'screenshot:history',
            context: `matchshot:${matchId}`,
        },
    ]);
};

export const awardReferralXp = async (
    referrerId: string,
    referredId: string
) => {
    if (referrerId === referredId) {
        throw new Error('Cannot refer yourself');
    }
    const referrer = await getQuery<{ id: string }>(
        `SELECT id FROM users WHERE id = ?`,
        [referrerId]
    );
    if (!referrer) {
        throw new Error('Referrer not found');
    }
    try {
        await runQuery(
            `INSERT INTO referrals (referrer_id, referred_id) VALUES (?, ?)`,
            [referrerId, referredId]
        );
    } catch (error) {
        if (isUniqueConstraintError(error)) {
            const xp = await loadXpTotal(referrerId);
            return { total: xp, delta: 0, breakdown: [] };
        }
        throw error;
    }
    return runEvents(referrerId, [
        {
            amount: XP_VALUES.REFERRAL,
            type: 'referral:bonus',
            context: `referral:${referredId}`,
        },
    ]);
};

export const getXpRewards = () => ({
    matchBase: XP_VALUES.MATCH_BASE,
    matchMapBonus: XP_VALUES.MATCH_MAP_BONUS,
    matchMomentumBonus: XP_VALUES.MATCH_MOMENTUM_BONUS,
    teamShare: XP_VALUES.TEAM_SHARE,
    matchScreenshot: XP_VALUES.MATCH_SCREENSHOT,
    playerCreate: XP_VALUES.PLAYER_CREATE,
    playerRemove: XP_VALUES.PLAYER_REMOVE,
    referralBonus: XP_VALUES.REFERRAL,
});
