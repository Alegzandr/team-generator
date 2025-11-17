import { randomUUID } from 'crypto';
import { allQuery, getQuery, runQuery } from '../db';

export interface UserSummary {
    id: string;
    username: string;
    avatar: string | null;
    joinedAt?: string | null;
    badges?: {
        og?: boolean;
        referral?: boolean;
    };
    badgesVisibleInSearch?: boolean;
}

export interface NetworkState {
    networkId: string;
    members: UserSummary[];
    incoming: Array<{ id: number; createdAt: string; sender: UserSummary }>;
    outgoing: Array<{ id: number; createdAt: string; recipient: UserSummary }>;
}

const sanitizeSearch = (term: string) => {
    return term.replace(/[\%_]/g, (match) => `\\${match}`);
};

const ensureNetworkRecord = async (networkId: string) => {
    if (!networkId) return;
    await runQuery(`INSERT OR IGNORE INTO networks (id) VALUES (?)`, [networkId]);
};

const mergeMapPreferences = async (targetNetworkId: string, sourceNetworkId: string) => {
    const targetRow = await getQuery<{ preferences: string }>(
        `SELECT preferences FROM map_preferences WHERE network_id = ?`,
        [targetNetworkId]
    );
    const sourceRow = await getQuery<{ preferences: string }>(
        `SELECT preferences FROM map_preferences WHERE network_id = ?`,
        [sourceNetworkId]
    );
    if (!sourceRow) {
        return;
    }
    if (!targetRow) {
        await runQuery(
            `UPDATE map_preferences SET network_id = ? WHERE network_id = ?`,
            [targetNetworkId, sourceNetworkId]
        );
        return;
    }
    const parsePrefs = (value: string | undefined) => {
        try {
            return value ? (JSON.parse(value) as { banned?: Record<string, string[]> }) : {};
        } catch {
            return {};
        }
    };
    const targetPrefs = parsePrefs(targetRow.preferences);
    const sourcePrefs = parsePrefs(sourceRow.preferences);
    const merged: Record<string, string[]> = { ...(targetPrefs.banned || {}) };
    Object.entries(sourcePrefs.banned || {}).forEach(([game, maps]) => {
        const existing = new Set(merged[game] || []);
        maps.forEach((map) => existing.add(map));
        merged[game] = Array.from(existing);
    });
    await runQuery(
        `INSERT INTO map_preferences (network_id, preferences)
         VALUES (?, ?)
         ON CONFLICT(network_id) DO UPDATE SET preferences = excluded.preferences`,
        [targetNetworkId, JSON.stringify({ banned: merged })]
    );
    await runQuery(`DELETE FROM map_preferences WHERE network_id = ?`, [sourceNetworkId]);
};

const removeInternalRequests = async (networkId: string) => {
    await runQuery(
        `DELETE FROM friend_requests
         WHERE sender_id IN (SELECT id FROM users WHERE network_id = ?)
           AND recipient_id IN (SELECT id FROM users WHERE network_id = ?)`,
        [networkId, networkId]
    );
};

interface NetworkMemberRow {
    id: string;
    username: string;
    avatar: string | null;
    network_joined_at?: string | null;
    badges_visible_in_search?: number;
    network_id: string;
}

const getNetworkMemberRows = async (networkId: string) => {
    return allQuery<NetworkMemberRow>(
        `SELECT id, username, avatar, network_joined_at, badges_visible_in_search, network_id
         FROM users
         WHERE network_id = ?
         ORDER BY datetime(network_joined_at) ASC`,
        [networkId]
    );
};

const getReferralEligibleIds = async (networkId: string) => {
    const rows = await allQuery<{ referrer_id: string }>(
        `SELECT DISTINCT referrer_id
         FROM referrals
         WHERE referrer_id IN (SELECT id FROM users WHERE network_id = ?)`,
        [networkId]
    );
    return new Set(rows.map((row) => row.referrer_id));
};

const calculateOgSet = (members: NetworkMemberRow[]) => {
    if (!members.length) return new Set<string>();
    const sorted = [...members].sort((a, b) => {
        const aTime = a.network_joined_at ? Date.parse(a.network_joined_at) : 0;
        const bTime = b.network_joined_at ? Date.parse(b.network_joined_at) : 0;
        return aTime - bTime;
    });
    const threshold = Math.max(1, Math.ceil(sorted.length * 0.25));
    const ogIds = new Set<string>();
    sorted.slice(0, threshold).forEach((member) => ogIds.add(member.id));
    return ogIds;
};

const toSummaryWithBadges = async (networkId: string, members: NetworkMemberRow[]) => {
    const ogIds = calculateOgSet(members);
    const referralIds = await getReferralEligibleIds(networkId);
    return members.map<UserSummary>((member) => ({
        id: member.id,
        username: member.username,
        avatar: member.avatar,
        joinedAt: member.network_joined_at ?? null,
        badgesVisibleInSearch: Boolean(member.badges_visible_in_search),
        badges: {
            og: ogIds.has(member.id),
            referral: referralIds.has(member.id),
        },
    }));
};

export const getKickEligibleIds = async (networkId: string) => {
    const members = await getNetworkMemberRows(networkId);
    return calculateOgSet(members);
};

const mergeNetworks = async (targetNetworkId: string, sourceNetworkId: string) => {
    if (targetNetworkId === sourceNetworkId) {
        return targetNetworkId;
    }
    await ensureNetworkRecord(targetNetworkId);
    await ensureNetworkRecord(sourceNetworkId);
    const sourceMembers = await allQuery<{ id: string }>(
        `SELECT id FROM users WHERE network_id = ?`,
        [sourceNetworkId]
    );
    await runQuery('BEGIN');
    try {
        await runQuery(`UPDATE players SET network_id = ? WHERE network_id = ?`, [
            targetNetworkId,
            sourceNetworkId,
        ]);
        await runQuery(`UPDATE matches SET network_id = ? WHERE network_id = ?`, [
            targetNetworkId,
            sourceNetworkId,
        ]);
        await mergeMapPreferences(targetNetworkId, sourceNetworkId);
        await runQuery(`UPDATE users SET network_id = ? WHERE network_id = ?`, [
            targetNetworkId,
            sourceNetworkId,
        ]);
        await runQuery(`DELETE FROM networks WHERE id = ?`, [sourceNetworkId]);
        await runQuery('COMMIT');
    } catch (error) {
        await runQuery('ROLLBACK');
        throw error;
    }
    if (sourceMembers.length) {
        const ids = sourceMembers.map((member) => member.id);
        const placeholders = ids.map(() => '?').join(', ');
        await runQuery(
            `UPDATE users SET network_joined_at = CURRENT_TIMESTAMP WHERE id IN (${placeholders})`,
            ids
        );
    }
    await removeInternalRequests(targetNetworkId);
    return targetNetworkId;
};

export const getNetworkMembers = async (networkId: string) => {
    const members = await getNetworkMemberRows(networkId);
    return toSummaryWithBadges(networkId, members);
};

export const getNetworkState = async (networkId: string, userId: string): Promise<NetworkState> => {
    const [memberRows, incoming, outgoing] = await Promise.all([
        getNetworkMemberRows(networkId),
        allQuery<{
            id: number;
            created_at: string;
            sender_id: string;
            username: string;
            avatar: string | null;
        }>(
            `SELECT fr.id, fr.created_at, fr.sender_id, u.username, u.avatar
             FROM friend_requests fr
             JOIN users u ON u.id = fr.sender_id
             WHERE fr.recipient_id = ? AND fr.status = 'pending'
             ORDER BY datetime(fr.created_at) ASC`,
            [userId]
        ),
        allQuery<{
            id: number;
            created_at: string;
            recipient_id: string;
            username: string;
            avatar: string | null;
        }>(
            `SELECT fr.id, fr.created_at, fr.recipient_id, u.username, u.avatar
             FROM friend_requests fr
             JOIN users u ON u.id = fr.recipient_id
             WHERE fr.sender_id = ? AND fr.status = 'pending'
             ORDER BY datetime(fr.created_at) ASC`,
            [userId]
        ),
    ]);
    const members = await toSummaryWithBadges(
        networkId,
        memberRows.sort((a, b) => {
            const aTime = a.network_joined_at ? Date.parse(a.network_joined_at) : 0;
            const bTime = b.network_joined_at ? Date.parse(b.network_joined_at) : 0;
            return aTime - bTime;
        })
    );

    return {
        networkId,
        members,
        incoming: incoming.map((row) => ({
            id: row.id,
            createdAt: row.created_at,
            sender: { id: row.sender_id, username: row.username, avatar: row.avatar },
        })),
        outgoing: outgoing.map((row) => ({
            id: row.id,
            createdAt: row.created_at,
            recipient: { id: row.recipient_id, username: row.username, avatar: row.avatar },
        })),
    };
};

export const searchNetworkCandidates = async (
    query: string,
    userId: string,
    networkId: string,
    limit = 8
) => {
    const trimmed = query.trim();
    if (!trimmed) {
        return [] as UserSummary[];
    }
    const likeTerm = `%${sanitizeSearch(trimmed)}%`;
    const rows = await allQuery<NetworkMemberRow>(
        `SELECT id, username, avatar, network_joined_at, badges_visible_in_search, network_id
         FROM users
         WHERE username LIKE ? ESCAPE '\\'
           AND id != ?
           AND network_id != ?
           AND id NOT IN (
               SELECT recipient_id FROM friend_requests WHERE sender_id = ? AND status = 'pending'
           )
           AND id NOT IN (
               SELECT sender_id FROM friend_requests WHERE recipient_id = ? AND status = 'pending'
           )
         ORDER BY username COLLATE NOCASE ASC
         LIMIT ?`,
        [likeTerm, userId, networkId, userId, userId, limit]
    );

    const results: UserSummary[] = [];
    for (const row of rows) {
        const badgesVisible = Boolean(row.badges_visible_in_search);
        if (!badgesVisible) {
            results.push({
                id: row.id,
                username: row.username,
                avatar: row.avatar,
                badgesVisibleInSearch: badgesVisible,
                badges: { og: false, referral: false },
            });
            continue;
        }
        const referralIds = await getReferralEligibleIds(row.network_id);
        const memberRows = await getNetworkMemberRows(row.network_id);
        const ogIds = calculateOgSet(memberRows);
        results.push({
            id: row.id,
            username: row.username,
            avatar: row.avatar,
            badgesVisibleInSearch: badgesVisible,
            badges: {
                og: ogIds.has(row.id),
                referral: referralIds.has(row.id),
            },
        });
    }
    return results;
};

export const sendFriendRequest = async (senderId: string, targetId: string) => {
    if (senderId === targetId) {
        throw new Error('Cannot send a request to yourself');
    }
    const target = await getQuery<{
        id: string;
        username: string;
        avatar: string | null;
        network_id: string;
    }>(`SELECT id, username, avatar, network_id FROM users WHERE id = ?`, [targetId]);
    if (!target) {
        throw new Error('User not found');
    }
    const sender = await getQuery<{ network_id: string }>(
        `SELECT network_id FROM users WHERE id = ?`,
        [senderId]
    );
    if (!sender) {
        throw new Error('Sender not found');
    }
    if (sender.network_id === target.network_id) {
        throw new Error('Already in the same network');
    }
    const existing = await getQuery<{ id: number }>(
        `SELECT id FROM friend_requests
         WHERE status = 'pending'
           AND ((sender_id = ? AND recipient_id = ?) OR (sender_id = ? AND recipient_id = ?))`,
        [senderId, targetId, targetId, senderId]
    );
    if (existing) {
        throw new Error('Request already pending');
    }
    const result = await runQuery(
        `INSERT INTO friend_requests (sender_id, recipient_id) VALUES (?, ?)`,
        [senderId, targetId]
    );
    const record = await getQuery<{ id: number; created_at: string }>(
        `SELECT id, created_at FROM friend_requests WHERE id = ?`,
        [result.lastID]
    );
    return {
        id: record?.id ?? result.lastID,
        createdAt: record?.created_at ?? new Date().toISOString(),
        recipient: {
            id: target.id,
            username: target.username,
            avatar: target.avatar,
            networkId: target.network_id,
            badges: { referral: false, og: false },
        },
    };
};

export const deleteFriendRequest = async (
    requestId: number,
    userId: string
) => {
    const request = await getQuery<{ sender_id: string; recipient_id: string }>(
        `SELECT sender_id, recipient_id
         FROM friend_requests
         WHERE id = ? AND (sender_id = ? OR recipient_id = ?)`,
        [requestId, userId, userId]
    );
    if (!request) {
        return null;
    }
    await runQuery(`DELETE FROM friend_requests WHERE id = ?`, [requestId]);
    return request.sender_id === userId
        ? request.recipient_id
        : request.sender_id;
};

const getNetworkSize = async (networkId: string) => {
    const row = await getQuery<{ count: number }>(
        `SELECT COUNT(*) as count FROM users WHERE network_id = ?`,
        [networkId]
    );
    return row?.count ?? 0;
};

export const acceptFriendRequest = async (requestId: number, recipientId: string) => {
    const request = await getQuery<{
        id: number;
        sender_id: string;
        recipient_id: string;
        sender_network_id: string;
        recipient_network_id: string;
    }>(
        `SELECT fr.id, fr.sender_id, fr.recipient_id,
                sender.network_id AS sender_network_id,
                recipient.network_id AS recipient_network_id
         FROM friend_requests fr
         JOIN users sender ON sender.id = fr.sender_id
         JOIN users recipient ON recipient.id = fr.recipient_id
         WHERE fr.id = ? AND fr.recipient_id = ? AND fr.status = 'pending'`,
        [requestId, recipientId]
    );
    if (!request) {
        throw new Error('Request not found');
    }
    await runQuery(`DELETE FROM friend_requests WHERE id = ?`, [requestId]);
    if (request.sender_network_id === request.recipient_network_id) {
        return {
            networkId: request.recipient_network_id,
            joinedUserId: request.sender_id,
        };
    }
    const [recipientSize, senderSize] = await Promise.all([
        getNetworkSize(request.recipient_network_id),
        getNetworkSize(request.sender_network_id),
    ]);
    let targetNetworkId = request.recipient_network_id;
    let sourceNetworkId = request.sender_network_id;
    if (senderSize > recipientSize) {
        targetNetworkId = request.sender_network_id;
        sourceNetworkId = request.recipient_network_id;
    }
    const mergedNetworkId = await mergeNetworks(targetNetworkId, sourceNetworkId);
    return {
        networkId: mergedNetworkId,
        joinedUserId: request.sender_id,
    };
};

export const createIsolatedNetwork = async () => {
    const id = `net_${randomUUID()}`;
    await ensureNetworkRecord(id);
    return id;
};

export const moveUserToNetwork = async (userId: string, networkId: string) => {
    await ensureNetworkRecord(networkId);
    await runQuery(
        `UPDATE users SET network_id = ?, network_joined_at = CURRENT_TIMESTAMP WHERE id = ?`,
        [networkId, userId]
    );
};

export const deleteNetworkIfEmpty = async (networkId: string) => {
    if (!networkId) return;
    const countRow = await getQuery<{ count: number }>(
        `SELECT COUNT(*) as count FROM users WHERE network_id = ?`,
        [networkId]
    );
    if ((countRow?.count ?? 0) === 0) {
        await runQuery(`DELETE FROM networks WHERE id = ?`, [networkId]);
    }
};

export const clearUserFriendRequests = async (userId: string) => {
    await runQuery(
        `DELETE FROM friend_requests WHERE sender_id = ? OR recipient_id = ?`,
        [userId, userId]
    );
};
