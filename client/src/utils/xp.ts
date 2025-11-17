import type { TeamAssignment } from './teamBalancer';

export const XP_LEVEL_BASE = 120;
export const XP_LEVEL_STEP = 30;

export interface LevelState {
    totalXp: number;
    level: number;
    xpIntoLevel: number;
    xpForLevel: number;
    progress: number;
}

export const calculateLevelState = (totalXp: number): LevelState => {
    let remaining = Math.max(0, totalXp);
    let level = 1;
    let requirement = XP_LEVEL_BASE;

    while (remaining >= requirement) {
        remaining -= requirement;
        level += 1;
        requirement = XP_LEVEL_BASE + (level - 1) * XP_LEVEL_STEP;
    }

    const progress = requirement === 0 ? 0 : remaining / requirement;

    return {
        totalXp,
        level,
        xpIntoLevel: remaining,
        xpForLevel: requirement,
        progress,
    };
};

const formatTeamSide = (players: TeamAssignment['teamA']) => {
    return players
        .map((player) => `${player.id ?? player.name}:${player.skill}`)
        .join(',');
};

const encodeSignaturePayload = (
    teams: TeamAssignment,
    options: { game?: string | null; map?: string | null }
) => {
    return [
        `A=${formatTeamSide(teams.teamA)}`,
        `B=${formatTeamSide(teams.teamB)}`,
        `game=${options.game ?? 'none'}`,
        `map=${options.map ?? 'none'}`,
    ].join('|');
};

const digestString = async (payload: string) => {
    if (window.crypto?.subtle) {
        const encoded = new TextEncoder().encode(payload);
        const buffer = await window.crypto.subtle.digest('SHA-256', encoded);
        return Array.from(new Uint8Array(buffer))
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join('');
    }
    let hash = 0;
    for (let i = 0; i < payload.length; i += 1) {
        hash = (hash << 5) - hash + payload.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash).toString(16);
};

export const generateTeamShareSignature = async (
    teams: TeamAssignment,
    options: { game?: string | null; map?: string | null }
) => {
    const payload = encodeSignaturePayload(teams, options);
    const digest = await digestString(payload);
    return `v1-${digest}`;
};
