import { allQuery, getQuery, runQuery } from '../db';
import { emitNotificationsUpdate } from './realtimeService';

export interface NotificationRecord {
    id: number;
    user_id: string;
    type: string;
    message: string | null;
    data: string | null;
    is_read: number;
    created_at: string;
}

export interface Notification {
    id: number;
    type: string;
    message: string | null;
    data: Record<string, unknown> | null;
    isRead: boolean;
    createdAt: string;
}

const parseData = (raw: string | null): Record<string, unknown> | null => {
    if (!raw) return null;
    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        return null;
    }
};

const toNotification = (row: NotificationRecord): Notification => ({
    id: row.id,
    type: row.type,
    message: row.message,
    data: parseData(row.data),
    isRead: Boolean(row.is_read),
    createdAt: row.created_at,
});

export const listNotifications = async (userId: string, limit = 50) => {
    const rows = await allQuery<NotificationRecord>(
        `SELECT id, user_id, type, message, data, is_read, created_at
         FROM notifications
         WHERE user_id = ?
         ORDER BY datetime(created_at) DESC
         LIMIT ?`,
        [userId, limit]
    );
    return rows.map(toNotification);
};

export const addNotification = async (
    targets: string | string[],
    input: { type: string; message?: string | null; data?: Record<string, unknown> }
) => {
    const targetList = Array.isArray(targets) ? targets : [targets];
    if (!targetList.length) return;
    await runQuery('BEGIN');
    try {
        for (const target of targetList) {
            await runQuery(
                `INSERT INTO notifications (user_id, type, message, data) VALUES (?, ?, ?, ?)`,
                [target, input.type, input.message ?? null, JSON.stringify(input.data ?? {})]
            );
        }
        await runQuery('COMMIT');
    } catch (error) {
        await runQuery('ROLLBACK');
        throw error;
    }
    emitNotificationsUpdate(targetList);
};

export const markNotificationRead = async (
    userId: string,
    notificationId: number,
    isRead: boolean
) => {
    const record = await getQuery<{ id: number }>(
        `SELECT id FROM notifications WHERE id = ? AND user_id = ?`,
        [notificationId, userId]
    );
    if (!record) {
        return false;
    }
    await runQuery(
        `UPDATE notifications SET is_read = ? WHERE id = ? AND user_id = ?`,
        [isRead ? 1 : 0, notificationId, userId]
    );
    emitNotificationsUpdate(userId);
    return true;
};

export const deleteNotification = async (userId: string, notificationId: number) => {
    const result = await runQuery(
        `DELETE FROM notifications WHERE id = ? AND user_id = ?`,
        [notificationId, userId]
    );
    const removed = (result.changes ?? 0) > 0;
    if (removed) {
        emitNotificationsUpdate(userId);
    }
    return removed;
};
