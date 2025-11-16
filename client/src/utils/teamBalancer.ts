import { TeamPlayer } from '../types';

export interface TeamAssignment {
    teamA: TeamPlayer[];
    teamB: TeamPlayer[];
}

export interface TeamStats {
    totalSkill: number;
    averageSkill: number;
}

const shufflePlayers = (players: TeamPlayer[]) => {
    const arr = [...players];
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
};

const playerValue = (player: TeamPlayer) =>
    typeof player.effectiveSkill === 'number' ? player.effectiveSkill : player.skill;

const sumSkill = (team: TeamPlayer[]) =>
    team.reduce((sum, player) => sum + playerValue(player), 0);

export const balanceTeams = (
    players: TeamPlayer[],
    playersPerTeam: number,
    iterations = 120
): TeamAssignment => {
    const required = playersPerTeam * 2;
    if (players.length < required) {
        return { teamA: [], teamB: [] };
    }

    let bestAssignment: TeamAssignment | null = null;
    let bestDiff = Number.POSITIVE_INFINITY;

    for (let i = 0; i < iterations; i += 1) {
        const shuffled = shufflePlayers(players);
        const selected = shuffled.slice(0, required);
        const teamA = selected.slice(0, playersPerTeam);
        const teamB = selected.slice(playersPerTeam, required);
        const diff = Math.abs(sumSkill(teamA) - sumSkill(teamB));

        if (diff < bestDiff) {
            bestAssignment = { teamA, teamB };
            bestDiff = diff;
        }
    }

    return (
        bestAssignment ?? {
            teamA: players.slice(0, playersPerTeam),
            teamB: players.slice(playersPerTeam, required),
        }
    );
};

export const getTeamStats = (team: TeamPlayer[]): TeamStats => {
    if (team.length === 0) {
        return { totalSkill: 0, averageSkill: 0 };
    }
    const totalSkill = sumSkill(team);
    return {
        totalSkill,
        averageSkill: Number((totalSkill / team.length).toFixed(2)),
    };
};
