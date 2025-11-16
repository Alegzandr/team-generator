import { getQuery, runQuery } from '../db';

export interface MapPreferencesRecord {
    banned: Record<string, string[]>;
}

const DEFAULT_PREFERENCES: MapPreferencesRecord = { banned: {} };

const normalizePreferences = (data: unknown): MapPreferencesRecord => {
    if (!data || typeof data !== 'object') {
        return DEFAULT_PREFERENCES;
    }
    const input = data as Partial<MapPreferencesRecord>;
    if (!input.banned || typeof input.banned !== 'object') {
        return DEFAULT_PREFERENCES;
    }
    const normalized: Record<string, string[]> = {};
    Object.entries(input.banned).forEach(([game, maps]) => {
        if (!Array.isArray(maps)) return;
        const filtered = maps.filter(
            (map): map is string => typeof map === 'string' && map.trim().length > 0
        );
        if (filtered.length) {
            normalized[game] = Array.from(new Set(filtered));
        }
    });
    return { banned: normalized };
};

export const getMapPreferences = async (
    userId: string
): Promise<MapPreferencesRecord> => {
    const row = await getQuery<{ preferences: string }>(
        'SELECT preferences FROM map_preferences WHERE user_id = ?',
        [userId]
    );
    if (!row) {
        return DEFAULT_PREFERENCES;
    }
    try {
        const parsed = JSON.parse(row.preferences);
        return normalizePreferences(parsed);
    } catch {
        return DEFAULT_PREFERENCES;
    }
};

export const saveMapPreferences = async (
    userId: string,
    preferences: Partial<MapPreferencesRecord>
) => {
    const normalized = normalizePreferences(preferences);
    await runQuery(
        `INSERT INTO map_preferences (user_id, preferences)
        VALUES (?, ?)
        ON CONFLICT(user_id) DO UPDATE SET preferences = excluded.preferences`,
        [userId, JSON.stringify(normalized)]
    );
    return normalized;
};
