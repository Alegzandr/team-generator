export type Winner = 'teamA' | 'teamB' | 'unknown';

export interface Player {
    id: number;
    name: string;
    skill: number;
}

export interface TemporaryPlayer {
    id: string;
    name: string;
    skill: number;
    temporary: true;
}

export interface TeamPlayer {
    id?: number | string;
    name: string;
    skill: number;
    temporary?: boolean;
    momentum?: number;
    effectiveSkill?: number;
}

export interface Match {
    id: number;
    teamA: TeamPlayer[];
    teamB: TeamPlayer[];
    teamA_score: number;
    teamB_score: number;
    winner: Winner;
    created_at: string;
    game?: string | null;
    map?: string | null;
}

export interface MapPreferences {
    banned: Record<string, string[]>;
}
