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
    networkId: string
): Promise<MapPreferencesRecord> => {
    const row = await getQuery<{ preferences: string }>(
        'SELECT preferences FROM map_preferences WHERE network_id = ?',
        [networkId]
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
    networkId: string,
    preferences: Partial<MapPreferencesRecord>
) => {
    const normalized = normalizePreferences(preferences);
    await runQuery(
        `INSERT INTO map_preferences (network_id, preferences)
        VALUES (?, ?)
        ON CONFLICT(network_id) DO UPDATE SET preferences = excluded.preferences`,
        [networkId, JSON.stringify(normalized)]
    );
    return normalized;
};
