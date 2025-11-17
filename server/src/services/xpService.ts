import { randomUUID } from 'crypto';
import { allQuery, getQuery, runQuery } from '../db';
import { emitXpUpdate } from './realtimeService';

const XP_VALUES = {
    MATCH_BASE: 50,
    MATCH_MAP_BONUS: 20,
    TEAM_SHARE: 15,
    MATCH_SCREENSHOT: 12,
    PLAYER_CREATE: 8,
    PLAYER_REMOVE: -5,
    REFERRAL: 150,
    NETWORK_MEMBER_JOIN: 45,
    NETWORK_MEMBER_LEAVE_SELF: -95,
    NETWORK_MEMBER_LEAVE_OTHERS: 0,
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

const loadNetworkMemberIds = async (networkId: string) => {
    const rows = await allQuery<{ id: string }>(
        `SELECT id FROM users WHERE network_id = ?`,
        [networkId]
    );
    return rows.map((row) => row.id);
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

const runEventsForNetwork = async (
    networkId: string,
    actorId: string,
    events: EventDescriptor[]
): Promise<XpSummary> => {
    const memberIds = await loadNetworkMemberIds(networkId);
    if (memberIds.length === 0) {
        return runEvents(actorId, events);
    }
    let actorSummary: XpSummary | null = null;
    for (const memberId of memberIds) {
        const summary = await runEvents(memberId, events);
        if (memberId === actorId) {
            actorSummary = summary;
        }
    }
    return actorSummary ?? (await runEvents(actorId, []));
};

export const getXpSnapshot = async (userId: string) => {
    const xp = await loadXpTotal(userId);
    return { xp };
};

export const awardMatchCompletionXp = async (
    userId: string,
    networkId: string,
    matchId: number,
    options: { mapSelection?: boolean }
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
    return runEventsForNetwork(networkId, userId, events);
};

export const awardPlayerCreationXp = async (
    userId: string,
    networkId: string,
    playerId: number
) => {
    return runEventsForNetwork(networkId, userId, [
        {
            amount: XP_VALUES.PLAYER_CREATE,
            type: 'player:create',
            context: `player:${playerId}:create`,
        },
    ]);
};

export const awardPlayerRemovalPenalty = async (
    userId: string,
    networkId: string,
    playerId: number
) => {
    return runEventsForNetwork(networkId, userId, [
        {
            amount: XP_VALUES.PLAYER_REMOVE,
            type: 'player:remove',
            context: `player:${playerId}:remove:${randomUUID()}`,
        },
    ]);
};

export const awardTeamShareXp = async (
    userId: string,
    networkId: string,
    signature: string
) => {
    return runEventsForNetwork(networkId, userId, [
        {
            amount: XP_VALUES.TEAM_SHARE,
            type: 'share:team',
            context: `teamshare:${signature}`,
        },
    ]);
};

export const awardMatchScreenshotXp = async (
    userId: string,
    networkId: string,
    matchId: number
) => {
    const match = await getQuery<{ id: number }>(
        `SELECT id FROM matches WHERE id = ? AND network_id = ?`,
        [matchId, networkId]
    );
    if (!match) {
        throw new Error('Match not found');
    }
    return runEventsForNetwork(networkId, userId, [
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
    const existingReferral = await getQuery<{ id: number }>(
        `SELECT id FROM referrals WHERE referred_id = ? LIMIT 1`,
        [referredId]
    );
    if (existingReferral) {
        const xp = await loadXpTotal(referrerId);
        return { total: xp, delta: 0, breakdown: [] };
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

export const awardNetworkMemberJoinXp = async (
    actorId: string,
    networkId: string,
    memberId: string
) => {
    return runEventsForNetwork(networkId, actorId, [
        {
            amount: XP_VALUES.NETWORK_MEMBER_JOIN,
            type: 'network:member_join',
            context: `network:${networkId}:join:${memberId}:${Date.now()}`,
        },
    ]);
};

export const awardNetworkDepartureXp = async (
    networkId: string,
    departingUserId: string,
    actorId: string
) => {
    const memberIds = await loadNetworkMemberIds(networkId);
    const contextBase = `network:${networkId}:leave:${departingUserId}:${Date.now()}`;
    let actorSummary: XpSummary | null = null;

    for (const memberId of memberIds) {
        const isDeparting = memberId === departingUserId;
        const events: EventDescriptor[] = [
            {
                amount: isDeparting
                    ? XP_VALUES.NETWORK_MEMBER_LEAVE_SELF
                    : XP_VALUES.NETWORK_MEMBER_LEAVE_OTHERS,
                type: isDeparting
                    ? 'network:member_leave:self'
                    : 'network:member_leave:peer',
                context: `${contextBase}:${memberId}`,
            },
        ];
        const summary = await runEvents(memberId, events);
        if (memberId === actorId) {
            actorSummary = summary;
        }
    }

    return actorSummary ?? (await runEvents(actorId, []));
};

export const getXpRewards = () => ({
    matchBase: XP_VALUES.MATCH_BASE,
    matchMapBonus: XP_VALUES.MATCH_MAP_BONUS,
    teamShare: XP_VALUES.TEAM_SHARE,
    matchScreenshot: XP_VALUES.MATCH_SCREENSHOT,
    playerCreate: XP_VALUES.PLAYER_CREATE,
    playerRemove: XP_VALUES.PLAYER_REMOVE,
    referralBonus: XP_VALUES.REFERRAL,
    networkMemberJoin: XP_VALUES.NETWORK_MEMBER_JOIN,
    networkMemberLeaveSelf: XP_VALUES.NETWORK_MEMBER_LEAVE_SELF,
    networkMemberLeaveOthers: XP_VALUES.NETWORK_MEMBER_LEAVE_OTHERS,
});
