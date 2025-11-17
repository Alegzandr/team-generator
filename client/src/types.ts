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
    status?: 'completed' | 'canceled';
}

export interface NetworkMember {
    id: string;
    username: string;
    avatar: string | null;
}

export interface IncomingFriendRequest {
    id: number;
    createdAt: string;
    sender: NetworkMember;
}

export interface OutgoingFriendRequest {
    id: number;
    createdAt: string;
    recipient: NetworkMember;
}

export interface NetworkState {
    networkId: string;
    members: NetworkMember[];
    incoming: IncomingFriendRequest[];
    outgoing: OutgoingFriendRequest[];
}

export interface MapPreferences {
    banned: Record<string, string[]>;
}

export interface XpBreakdownEntry {
    type: string;
    amount: number;
}

export interface XpSummary {
    total: number;
    delta: number;
    breakdown?: XpBreakdownEntry[];
}

export interface MatchSaveResponse {
    match: Match;
    xp?: XpSummary;
}

export interface PlayerMutationResponse {
    player: Player;
    xp?: XpSummary;
}

export interface XpSnapshot {
    xp: number;
}

export interface XpEventResponse {
    xp?: XpSummary;
}

export interface XpRewards {
    matchBase: number;
    matchMapBonus: number;
    matchMomentumBonus: number;
    teamShare: number;
    matchScreenshot: number;
    playerCreate: number;
    playerRemove: number;
    referralBonus: number;
    networkMemberJoin: number;
    networkMemberLeave: number;
}
