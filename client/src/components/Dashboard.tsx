import { DragEvent, FormEvent, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import type { Match, Player, TeamPlayer, TemporaryPlayer, Winner } from '../types';
import { TeamAssignment, balanceTeams, getTeamStats } from '../utils/teamBalancer';
import SkillSelector from './SkillSelector';
import MatchResultModal from './MatchResultModal';

const API_URL = import.meta.env.VITE_API_URL || '';
const MOMENTUM_WINDOW_MS = 1000 * 60 * 60 * 4;
const MOMENTUM_STEP = 0.5;
const FAIRNESS_THRESHOLD = 3;
const DEFAULT_TEAM_NAMES = { teamA: 'Attackers', teamB: 'Defenders' };
const DRAG_DATA_FORMAT = 'application/x-team-generator';

type DragPayload =
    | { type: 'team'; from: 'teamA' | 'teamB'; player: TeamPlayer }
    | { type: 'saved'; playerId: number }
    | { type: 'temporary'; tempId: string; fromList: 'temporary' | 'saved' };

const encodeDragPayload = (payload: DragPayload) => JSON.stringify(payload);
const decodeDragPayload = (data?: string | null): DragPayload | null => {
    if (!data) return null;
    try {
        return JSON.parse(data) as DragPayload;
    } catch {
        return null;
    }
};

const beginDrag = (event: DragEvent, payload: DragPayload) => {
    if (!event.dataTransfer) return;
    event.dataTransfer.setData(DRAG_DATA_FORMAT, encodeDragPayload(payload));
    event.dataTransfer.effectAllowed = 'move';
};

const readDragPayload = (event: DragEvent): DragPayload | null => {
    const data = event.dataTransfer?.getData(DRAG_DATA_FORMAT);
    return decodeDragPayload(data);
};

const reorderList = <T,>(list: T[], fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) {
        return list;
    }
    const copy = [...list];
    const [item] = copy.splice(fromIndex, 1);
    copy.splice(toIndex, 0, item);
    return copy;
};

const insertAt = <T,>(list: T[], item: T, index?: number) => {
    const copy = [...list];
    if (index === undefined || index < 0 || index >= copy.length) {
        copy.push(item);
    } else {
        copy.splice(index, 0, item);
    }
    return copy;
};

const generateTempId = () =>
    crypto.randomUUID?.() ?? Math.random().toString(36).slice(2);

const getPlayerKey = (player: { id?: number | string; name: string }) =>
    player.id !== undefined ? `id-${player.id}` : `name-${player.name.toLowerCase()}`;

const sanitizeTeam = (team: TeamPlayer[]) =>
    team.map(({ id, name, skill, temporary }) => ({
        id,
        name,
        skill,
        temporary: Boolean(temporary),
    }));

const calculateMomentumMap = (matches: Match[]) => {
    const now = Date.now();
    const map: Record<string, number> = {};

    matches.forEach((match) => {
        const playedAt = new Date(match.created_at).getTime();
        if (now - playedAt > MOMENTUM_WINDOW_MS) {
            return;
        }

        const updateMomentum = (team: TeamPlayer[], delta: number) => {
            team.forEach((player) => {
                const key = getPlayerKey(player);
                map[key] = (map[key] ?? 0) + delta;
            });
        };

        if (match.winner === 'teamA') {
            updateMomentum(match.teamA, MOMENTUM_STEP);
            updateMomentum(match.teamB, -MOMENTUM_STEP);
        } else if (match.winner === 'teamB') {
            updateMomentum(match.teamB, MOMENTUM_STEP);
            updateMomentum(match.teamA, -MOMENTUM_STEP);
        }
    });

    Object.keys(map).forEach((key) => {
        map[key] = Number(map[key].toFixed(2));
    });

    return map;
};

const augmentPlayerWithMomentum = <T extends { id?: number | string; name: string; skill: number }>(
    player: T,
    momentumMap: Record<string, number>
): TeamPlayer => {
    const key = getPlayerKey(player);
    const momentum = momentumMap[key] ?? 0;
    return {
        ...player,
        momentum,
        effectiveSkill: Number((player.skill + momentum).toFixed(2)),
    };
};

const isSamePlayer = (a: TeamPlayer, b: TeamPlayer) => {
    return getPlayerKey(a) === getPlayerKey(b) && a.name === b.name;
};

const Dashboard = () => {
    const { user, logout } = useAuth();
    const { t, language, setLanguage } = useLanguage();
    const { pushToast } = useToast();

    const [players, setPlayers] = useState<Player[]>([]);
    const [playersLoading, setPlayersLoading] = useState(false);
    const [matches, setMatches] = useState<Match[]>([]);
    const [matchesLoading, setMatchesLoading] = useState(false);
    const [temporaryPlayers, setTemporaryPlayers] = useState<TemporaryPlayer[]>([]);
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<number>>(new Set());
    const [selectedTemporaryIds, setSelectedTemporaryIds] = useState<Set<string>>(
        new Set()
    );
    const [playerName, setPlayerName] = useState('');
    const [playerSkill, setPlayerSkill] = useState(3);
    const [tempName, setTempName] = useState('');
    const [tempSkill, setTempSkill] = useState(3);
    const [playersPerTeam, setPlayersPerTeam] = useState(5);
    const [teamNames, setTeamNames] = useState(DEFAULT_TEAM_NAMES);
    const [teams, setTeams] = useState<TeamAssignment>({ teamA: [], teamB: [] });
    const [editingPlayerId, setEditingPlayerId] = useState<number | null>(null);
    const [editingName, setEditingName] = useState('');
    const [editingSkill, setEditingSkill] = useState(3);
    const [editingTempId, setEditingTempId] = useState<string | null>(null);
    const [editingTempName, setEditingTempName] = useState('');
    const [editingTempSkill, setEditingTempSkill] = useState(3);
    const [convertingTempIds, setConvertingTempIds] = useState<Set<string>>(new Set());
    const [resultModalOpen, setResultModalOpen] = useState(false);
    const [resultModalMode, setResultModalMode] = useState<'new' | 'edit'>('new');
    const [matchBeingEdited, setMatchBeingEdited] = useState<Match | null>(null);

    const momentumMap = useMemo(() => calculateMomentumMap(matches), [matches]);

    const selectedPlayers: TeamPlayer[] = useMemo(() => {
        const saved = players
            .filter((player) => selectedPlayerIds.has(player.id))
            .map((player) => augmentPlayerWithMomentum(player, momentumMap));
        const temps = temporaryPlayers
            .filter((player) => selectedTemporaryIds.has(player.id))
            .map((player) =>
                augmentPlayerWithMomentum({ ...player, temporary: true }, momentumMap)
            );
        return [...saved, ...temps];
    }, [players, temporaryPlayers, selectedPlayerIds, selectedTemporaryIds, momentumMap]);

    const requiredPlayers = playersPerTeam * 2;
    const canGenerateTeams = selectedPlayers.length >= requiredPlayers;
    const teamsReady =
        teams.teamA.length === playersPerTeam && teams.teamB.length === playersPerTeam;
    const canSaveMatch = teamsReady;
    const fairnessDiff = teamsReady
        ? Math.abs(
              getTeamStats(teams.teamA).totalSkill - getTeamStats(teams.teamB).totalSkill
          )
        : 0;
    const fairnessWarning = teamsReady && fairnessDiff > FAIRNESS_THRESHOLD;

    const apiRequest = async <T,>(
        path: string,
        options: RequestInit = {}
    ): Promise<T> => {
        const response = await fetch(`${API_URL}${path}`, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...(options.headers || {}),
            },
            credentials: 'include',
        });

        if (response.status === 401) {
            await logout({ silent: true });
            throw new Error('Unauthorized');
        }

        if (!response.ok) {
            const message = await response.text();
            throw new ApiError(message || 'Request failed', response.status);
        }

        if (response.status === 204) {
            return null as T;
        }

        return (await response.json()) as T;
    };

    useEffect(() => {
        if (!user) {
            setPlayers([]);
            setMatches([]);
            return;
        }

        const loadPlayers = async () => {
            setPlayersLoading(true);
            try {
                const data = await apiRequest<Player[]>('/api/players');
                setPlayers(data);
            } catch (error) {
                pushToast(t('feedback.error'), 'error');
            } finally {
                setPlayersLoading(false);
            }
        };

        const loadMatches = async () => {
            setMatchesLoading(true);
            try {
                const data = await apiRequest<Match[]>('/api/matches');
                setMatches(data);
            } catch (error) {
                pushToast(t('feedback.error'), 'error');
            } finally {
                setMatchesLoading(false);
            }
        };

        loadPlayers();
        loadMatches();
    }, [user, t, pushToast]);

    useEffect(() => {
        setSelectedPlayerIds((prev) => {
            const next = new Set<number>();
            players.forEach((player) => {
                if (prev.has(player.id)) {
                    next.add(player.id);
                }
            });
            return next;
        });
    }, [players]);

    const togglePlayerSelection = (playerId: number) => {
        setSelectedPlayerIds((prev) => {
            const next = new Set(prev);
            if (next.has(playerId)) {
                next.delete(playerId);
            } else {
                next.add(playerId);
            }
            return next;
        });
    };

    const toggleTemporarySelectionState = (tempId: string) => {
        setSelectedTemporaryIds((prev) => {
            const next = new Set(prev);
            if (next.has(tempId)) {
                next.delete(tempId);
            } else {
                next.add(tempId);
            }
            return next;
        });
    };

    const selectAllSavedPlayers = () => {
        setSelectedPlayerIds(new Set(players.map((player) => player.id)));
    };

    const clearSavedPlayers = () => {
        setSelectedPlayerIds(new Set());
    };

    const selectAllTemporaryPlayers = () => {
        setSelectedTemporaryIds(new Set(temporaryPlayers.map((player) => player.id)));
    };

    const clearTemporaryPlayers = () => {
        setSelectedTemporaryIds(new Set());
    };

    const toggleAllSavedSelections = () => {
        if (players.length === 0) return;
        if (selectedPlayerIds.size === players.length) {
            clearSavedPlayers();
        } else {
            selectAllSavedPlayers();
        }
    };

    const toggleAllTemporarySelections = () => {
        if (temporaryPlayers.length === 0) return;
        if (selectedTemporaryIds.size === temporaryPlayers.length) {
            clearTemporaryPlayers();
        } else {
            selectAllTemporaryPlayers();
        }
    };

    const handleAddPlayer = async (event: FormEvent) => {
        event.preventDefault();
        if (!playerName.trim()) {
            return;
        }
        try {
            const player = await apiRequest<Player>('/api/players', {
                method: 'POST',
                body: JSON.stringify({
                    name: playerName.trim(),
                    skill: playerSkill,
                }),
            });
            setPlayers((prev) => [...prev, player]);
            setPlayerName('');
            setPlayerSkill(3);
            pushToast(t('actions.addPlayer'), 'success');
        } catch (error) {
            pushToast(t('feedback.error'), 'error');
        }
    };

    const handleDeletePlayer = async (playerId: number) => {
        if (!window.confirm(t('players.removeConfirmation'))) {
            return;
        }
        try {
            await apiRequest(`/api/players/${playerId}`, { method: 'DELETE' });
            setPlayers((prev) => prev.filter((player) => player.id !== playerId));
            setSelectedPlayerIds((prev) => {
                const next = new Set(prev);
                next.delete(playerId);
                return next;
            });
            pushToast(t('actions.remove'), 'info');
        } catch (error) {
            pushToast(t('feedback.error'), 'error');
        }
    };

    const startEditingPlayer = (player: Player) => {
        setEditingPlayerId(player.id);
        setEditingName(player.name);
        setEditingSkill(player.skill);
    };

    const cancelEditing = () => {
        setEditingPlayerId(null);
        setEditingName('');
        setEditingSkill(3);
    };

    const handleUpdatePlayer = async (event: FormEvent) => {
        event.preventDefault();
        if (!editingPlayerId || !editingName.trim()) return;
        try {
            const updated = await apiRequest<Player>(`/api/players/${editingPlayerId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    name: editingName.trim(),
                    skill: editingSkill,
                }),
            });
            setPlayers((prev) =>
                prev.map((player) => (player.id === updated.id ? updated : player))
            );
            cancelEditing();
            pushToast(t('actions.saveChanges'), 'success');
        } catch (error) {
            pushToast(t('feedback.error'), 'error');
        }
    };

    const startEditingTempPlayer = (player: TemporaryPlayer) => {
        setEditingTempId(player.id);
        setEditingTempName(player.name);
        setEditingTempSkill(player.skill);
    };

    const cancelTempEditing = () => {
        setEditingTempId(null);
        setEditingTempName('');
        setEditingTempSkill(3);
    };

    const handleUpdateTemporaryPlayer = (event: FormEvent) => {
        event.preventDefault();
        if (!editingTempId || !editingTempName.trim()) return;
        setTemporaryPlayers((prev) =>
            prev.map((player) =>
                player.id === editingTempId
                    ? { ...player, name: editingTempName.trim(), skill: editingTempSkill }
                    : player
            )
        );
        cancelTempEditing();
    };

    const handleAddTemporaryPlayer = (event: FormEvent) => {
        event.preventDefault();
        if (!tempName.trim()) return;
        const newPlayer: TemporaryPlayer = {
            id: generateTempId(),
            name: tempName.trim(),
            skill: tempSkill,
            temporary: true,
        };
        setTemporaryPlayers((prev) => [...prev, newPlayer]);
        setTempName('');
        setTempSkill(3);
    };

    const handleRemoveTemporaryPlayer = (playerId: string) => {
        setTemporaryPlayers((prev) => prev.filter((player) => player.id !== playerId));
        setSelectedTemporaryIds((prev) => {
            const next = new Set(prev);
            next.delete(playerId);
            return next;
        });
    };

    const convertTemporaryToSaved = async (tempId: string, insertIndex?: number) => {
        if (convertingTempIds.has(tempId)) return;
        const tempPlayer = temporaryPlayers.find((player) => player.id === tempId);
        if (!tempPlayer) return;
        setConvertingTempIds((prev) => new Set(prev).add(tempId));
        setTemporaryPlayers((prev) => prev.filter((player) => player.id !== tempId));
        setSelectedTemporaryIds((prev) => {
            const next = new Set(prev);
            next.delete(tempId);
            return next;
        });
        try {
            const newPlayer = await apiRequest<Player>('/api/players', {
                method: 'POST',
                body: JSON.stringify({
                    name: tempPlayer.name,
                    skill: tempPlayer.skill,
                }),
            });
            setPlayers((prev) => insertAt(prev, newPlayer, insertIndex));
            pushToast(t('actions.addPlayer'), 'success');
        } catch (error) {
            setTemporaryPlayers((prev) => insertAt(prev, tempPlayer, insertIndex));
            setSelectedTemporaryIds((prev) => {
                const next = new Set(prev);
                next.add(tempId);
                return next;
            });
            pushToast(t('feedback.error'), 'error');
        } finally {
            setConvertingTempIds((prev) => {
                const next = new Set(prev);
                next.delete(tempId);
                return next;
            });
        }
    };

    const handleSavedDrop = async (
        event: DragEvent<HTMLElement>,
        targetIndex?: number
    ) => {
        event.preventDefault();
        const payload = readDragPayload(event);
        if (!payload) return;

        if (payload.type === 'saved') {
            const fromIndex = players.findIndex((player) => player.id === payload.playerId);
            if (fromIndex === -1) return;
            const toIndex =
                targetIndex === undefined ? players.length - 1 : Math.max(0, targetIndex);
            setPlayers((prev) => reorderList(prev, fromIndex, toIndex));
        } else if (payload.type === 'temporary') {
            await convertTemporaryToSaved(payload.tempId, targetIndex);
        }
    };

    const handleTemporaryDrop = (
        event: DragEvent<HTMLElement>,
        targetIndex?: number
    ) => {
        event.preventDefault();
        const payload = readDragPayload(event);
        if (!payload || payload.type !== 'temporary') return;
        const fromIndex = temporaryPlayers.findIndex((player) => player.id === payload.tempId);
        if (fromIndex === -1) return;
        const toIndex =
            targetIndex === undefined ? temporaryPlayers.length - 1 : Math.max(0, targetIndex);
        setTemporaryPlayers((prev) => reorderList(prev, fromIndex, toIndex));
    };


    const regenerateTeams = () => {
        const assignment = balanceTeams(selectedPlayers, playersPerTeam);
        setTeams(assignment);
    };

    const handleGenerateTeams = () => {
        if (!canGenerateTeams) {
            pushToast(
                t('teams.notEnoughPlayers', {
                    needed: Math.max(0, requiredPlayers - selectedPlayers.length),
                }),
                'error'
            );
            return;
        }
        regenerateTeams();
    };

    const handleRerollTeams = () => {
        if (!teamsReady) {
            pushToast(
                t('teams.notEnoughPlayers', {
                    needed: Math.max(0, requiredPlayers - selectedPlayers.length),
                }),
                'error'
            );
            return;
        }
        regenerateTeams();
    };

    const transferPlayer = (
        player: TeamPlayer,
        from: 'teamA' | 'teamB',
        to: 'teamA' | 'teamB'
    ) => {
        setTeams((prev) => {
            if (from === to) return prev;
            const sourceTeam = from === 'teamA' ? prev.teamA : prev.teamB;
            const destinationTeam = to === 'teamA' ? prev.teamA : prev.teamB;
            if (destinationTeam.length >= playersPerTeam) {
                return prev;
            }
            const updatedSource = sourceTeam.filter((member) => !isSamePlayer(member, player));
            const updatedDestination = [...destinationTeam, player];
            return from === 'teamA'
                ? { teamA: updatedSource, teamB: updatedDestination }
                : { teamA: updatedDestination, teamB: updatedSource };
        });
    };

    const handleManualMove = (player: TeamPlayer, from: 'teamA' | 'teamB') => {
        transferPlayer(player, from, from === 'teamA' ? 'teamB' : 'teamA');
    };

    const handleTeamDragStart = (
        event: DragEvent<HTMLButtonElement>,
        player: TeamPlayer,
        from: 'teamA' | 'teamB'
    ) => {
        beginDrag(event, { type: 'team', from, player });
    };

    const handleDropOnTeam = (
        event: DragEvent<HTMLElement>,
        target: 'teamA' | 'teamB',
        targetPlayer?: TeamPlayer
    ) => {
        event.preventDefault();
        event.stopPropagation();
        const payload = readDragPayload(event);
        if (!payload || payload.type !== 'team') return;
        const { player, from } = payload;
        setTeams((prev) => {
            const teamA = [...prev.teamA];
            const teamB = [...prev.teamB];
            const getList = (key: 'teamA' | 'teamB') => (key === 'teamA' ? teamA : teamB);
            const sourceList = getList(from);
            const targetList = getList(target);
            const sourceIndex = sourceList.findIndex((member) => isSamePlayer(member, player));
            if (sourceIndex === -1) return prev;

            if (from === target) {
                if (!targetPlayer) return prev;
                const targetIndex = targetList.findIndex((member) =>
                    isSamePlayer(member, targetPlayer)
                );
                if (targetIndex === -1) return prev;
                const reordered = reorderList(targetList, sourceIndex, targetIndex);
                if (target === 'teamA') {
                    return { teamA: reordered, teamB: prev.teamB };
                }
                return { teamA: prev.teamA, teamB: reordered };
            }

            const [moving] = sourceList.splice(sourceIndex, 1);
            let targetIndex = targetPlayer
                ? targetList.findIndex((member) => isSamePlayer(member, targetPlayer))
                : targetList.length;
            if (targetIndex === -1) {
                targetIndex = targetList.length;
            }

            let displaced: TeamPlayer | null = null;
            if (targetList.length >= playersPerTeam) {
                if (!targetPlayer) {
                    sourceList.splice(sourceIndex, 0, moving);
                    return prev;
                }
                displaced = targetList[targetIndex];
                targetList.splice(targetIndex, 1);
            }

            targetList.splice(
                Math.min(targetIndex, targetList.length),
                0,
                moving
            );

            if (displaced) {
                sourceList.splice(
                    Math.min(sourceIndex, sourceList.length),
                    0,
                    displaced
                );
            }

            return {
                teamA: teamA,
                teamB: teamB,
            };
        });
    };

    const handleSaveMatch = async (scores: { teamA: number; teamB: number }) => {
        if (!canSaveMatch) {
            pushToast(t('teams.notEnoughPlayers', { needed: 0 }), 'error');
            return;
        }

        try {
            const match = await apiRequest<Match>('/api/matches', {
                method: 'POST',
                body: JSON.stringify({
                    teamA: sanitizeTeam(teams.teamA),
                    teamB: sanitizeTeam(teams.teamB),
                    teamA_score: scores.teamA,
                    teamB_score: scores.teamB,
                }),
            });
            setMatches((prev) => [match, ...prev]);
            pushToast(t('feedback.saved'), 'success');
        } catch (error) {
            pushToast(t('feedback.error'), 'error');
        }
    };

    const handleUpdateMatch = async (
        matchId: number,
        scores: { teamA: number; teamB: number }
    ) => {
        try {
            const updated = await apiRequest<Match>(`/api/matches/${matchId}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    teamA_score: scores.teamA,
                    teamB_score: scores.teamB,
                }),
            });
            setMatches((prev) =>
                prev.map((match) => (match.id === matchId ? updated : match))
            );
            pushToast(t('matches.editResult'), 'success');
        } catch (error) {
            pushToast(t('feedback.error'), 'error');
        }
    };

    const handleDeleteMatch = async (matchId: number) => {
        if (!window.confirm(t('matches.deleteConfirm'))) return;
        const performDelete = async () => {
            try {
                await apiRequest(`/api/matches/${matchId}`, { method: 'DELETE' });
            } catch (error) {
                if (
                    error instanceof ApiError &&
                    (error.status === 404 || error.status === 405)
                ) {
                    await apiRequest(`/api/matches/${matchId}/delete`, { method: 'POST' });
                } else {
                    throw error;
                }
            }
        };

        try {
            await performDelete();
            setMatches((prev) => prev.filter((match) => match.id !== matchId));
            pushToast(t('feedback.matchDeleted'), 'info');
        } catch (error) {
            pushToast(t('feedback.error'), 'error');
        }
    };

    const handleDeleteAccount = async () => {
        if (!window.confirm(t('gdpr.deleteConfirm'))) return;
        try {
            await apiRequest('/api/user', { method: 'DELETE' });
            pushToast(t('feedback.deleted'), 'info');
            await logout({ silent: true });
        } catch (error) {
            pushToast(t('feedback.error'), 'error');
        }
    };

    const openResultModal = () => {
        if (!canSaveMatch) {
            pushToast(t('teams.notEnoughPlayers', { needed: 0 }), 'error');
            return;
        }
        setResultModalMode('new');
        setMatchBeingEdited(null);
        setResultModalOpen(true);
    };

    const openEditResultModal = (match: Match) => {
        setResultModalMode('edit');
        setMatchBeingEdited(match);
        setResultModalOpen(true);
    };

    const handleModalConfirm = (scores: { teamA: number; teamB: number }) => {
        setResultModalOpen(false);
        if (resultModalMode === 'edit' && matchBeingEdited) {
            handleUpdateMatch(matchBeingEdited.id, scores);
        } else {
            handleSaveMatch(scores);
        }
    };

    const winnerLabel = (winner: Winner) => {
        switch (winner) {
            case 'teamA':
                return t('matches.won');
            case 'teamB':
                return t('matches.lost');
            default:
                return t('matches.unknown');
        }
    };

    const renderTeamCard = (teamKey: 'teamA' | 'teamB') => {
        const label = teamKey === 'teamA' ? t('teams.teamA') : t('teams.teamB');
        const stats = getTeamStats(teams[teamKey]);
        return (
            <div
                className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow dark:border-slate-700 dark:bg-slate-900/80"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDropOnTeam(e, teamKey)}
            >
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
                        <h3 className="text-xl font-semibold text-slate-900 dark:text-white">
                            {teamNames[teamKey]}
                        </h3>
                    </div>
                    <div className="text-right text-sm text-slate-500 dark:text-slate-400">
                        <p>
                            {t('teams.average')}: {stats.averageSkill}
                        </p>
                        <p>
                            {t('teams.totalSkill')}: {stats.totalSkill}
                        </p>
                    </div>
                </div>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-500">{t('teams.manualMove')}</p>
                <div className="mt-3 flex flex-col gap-2">
                    {teams[teamKey].map((player) => (
                        <button
                            key={`${player.id ?? player.name}-${player.name}`}
                            type="button"
                            draggable
                            onDragStart={(e) => handleTeamDragStart(e, player, teamKey)}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleDropOnTeam(e, teamKey, player)}
                            onClick={() => handleManualMove(player, teamKey)}
                            className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-2 text-left transition hover:border-indigo-200 hover:bg-indigo-50 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:border-indigo-400 dark:hover:bg-slate-800"
                        >
                            <div>
                                <p className="font-medium text-slate-800 dark:text-slate-100">
                                    {player.name}
                                </p>
                                {typeof player.momentum === 'number' && player.momentum !== 0 && (
                                    <span className="text-xs text-indigo-600">
                                        {t('players.momentumLabel')}:{' '}
                                        {player.momentum > 0 ? '+' : ''}
                                        {player.momentum}
                                    </span>
                                )}
                            </div>
                            <span className="text-sm font-semibold text-slate-600 dark:text-slate-200">
                                {player.effectiveSkill ?? player.skill}
                            </span>
                        </button>
                    ))}
                    {teams[teamKey].length === 0 && (
                        <p className="text-sm text-slate-400 dark:text-slate-500">
                            {t('teams.empty')}
                        </p>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-10 text-slate-900 dark:text-slate-100">
            <header className="rounded-3xl border border-slate-200 bg-white/70 p-6 shadow dark:border-slate-700 dark:bg-slate-900/70">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                        {user?.avatar ? (
                            <img
                                src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                                alt={user.username}
                                className="h-12 w-12 rounded-full border border-slate-200 dark:border-slate-600"
                            />
                        ) : (
                            <div className="h-12 w-12 rounded-full bg-slate-200 dark:bg-slate-700" />
                        )}
                        <div>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {t('app.title')}
                            </p>
                            <p className="text-xl font-semibold text-slate-900 dark:text-white">
                                {user?.username}
                            </p>
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-1">
                            <span className="text-sm text-slate-500 dark:text-slate-400">
                                {t('language.label')}
                            </span>
                            {(['en', 'fr'] as const).map((lang) => (
                                <button
                                    key={lang}
                                    onClick={() => setLanguage(lang)}
                                    className={`rounded-full px-3 py-1 text-sm font-semibold ${
                                        language === lang
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-200'
                                    }`}
                                >
                                    {lang.toUpperCase()}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => logout()}
                            className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:border-slate-300 dark:border-slate-600 dark:text-slate-200 dark:hover:border-slate-500"
                        >
                            {t('actions.logout')}
                        </button>
                        <button
                            onClick={handleDeleteAccount}
                            className="rounded-full border border-red-200 px-4 py-2 text-sm font-semibold text-red-600 transition hover:border-red-300 dark:border-red-700 dark:text-red-300 dark:hover:border-red-600"
                        >
                            {t('actions.deleteAccount')}
                        </button>
                    </div>
                </div>
            </header>

            <div className="grid gap-6 lg:grid-cols-2">
                <section className="flex flex-col gap-6 rounded-3xl border border-slate-200 bg-white/70 p-6 shadow dark:border-slate-700 dark:bg-slate-900/70">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                                {t('players.title')}
                            </h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {t('players.selectHelp')}
                            </p>
                        </div>
                        <button
                            className="text-xs font-semibold text-indigo-600 disabled:text-slate-400"
                            disabled={!players.length}
                            onClick={toggleAllSavedSelections}
                        >
                            {players.length > 0 && selectedPlayerIds.size === players.length
                                ? t('actions.clearAll')
                                : t('actions.selectAll')}
                        </button>
                    </div>

                    <form onSubmit={handleAddPlayer} className="flex flex-col gap-3">
                        <div>
                            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                {t('players.nameLabel')}
                            </label>
                            <input
                                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                placeholder={t('players.namePlaceholder')}
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                {t('players.skillLabel')}
                            </label>
                            <div className="mt-2">
                                <SkillSelector
                                    name="new-player-skill"
                                    value={playerSkill}
                                    onChange={setPlayerSkill}
                                />
                            </div>
                            <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                                {t('players.skillHelp')}
                            </p>
                        </div>
                        <button
                            type="submit"
                            disabled={!playerName.trim()}
                            className="rounded-xl bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                        >
                            {t('actions.addPlayer')}
                        </button>
                    </form>

                        <div
                            className="max-h-64 space-y-2 overflow-auto pr-2"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleSavedDrop(e)}
                    >
                        {playersLoading && (
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {t('loading.players')}
                            </p>
                        )}
                        {!playersLoading && players.length === 0 && (
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                {t('players.empty')}
                            </p>
                        )}
                        {players.map((player, index) => {
                            const selected = selectedPlayerIds.has(player.id);
                            const momentum = momentumMap[getPlayerKey(player)] ?? 0;
                            const isEditing = editingPlayerId === player.id;
                            const showMomentum = Math.abs(momentum) > 0.01;
                            return (
                                <div
                                    key={player.id}
                                    className={`rounded-2xl border px-3 py-3 ${
                                        selected
                                            ? 'border-indigo-200 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-500/20'
                                            : 'border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800/60'
                                    }`}
                                    draggable
                                    onDragStart={(e) =>
                                        beginDrag(e, { type: 'saved', playerId: player.id })
                                    }
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => handleSavedDrop(e, index)}
                                >
                                    {isEditing ? (
                                        <form
                                            onSubmit={handleUpdatePlayer}
                                            className="flex flex-col gap-2"
                                        >
                                            <input
                                                className="rounded-xl border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                                value={editingName}
                                                onChange={(e) => setEditingName(e.target.value)}
                                            />
                                            <SkillSelector
                                                name={`edit-player-${player.id}`}
                                                compact
                                                value={editingSkill}
                                                onChange={setEditingSkill}
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    type="submit"
                                                    className="rounded-xl bg-indigo-600 px-3 py-1 text-xs font-semibold text-white disabled:bg-slate-200 dark:disabled:bg-slate-700"
                                                    disabled={!editingName.trim()}
                                                >
                                                    {t('actions.saveChanges')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={cancelEditing}
                                                    className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-200"
                                                >
                                                    {t('actions.cancel')}
                                                </button>
                                            </div>
                                        </form>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                                                    <input
                                                        type="checkbox"
                                                        checked={selected}
                                                        onChange={() => togglePlayerSelection(player.id)}
                                                    />
                                                    {player.name}
                                                </label>
                                                <p className="text-xs text-slate-400 dark:text-slate-500">
                                                    {t('players.skillLabel')}: {player.skill}
                                                </p>
                                                {showMomentum && (
                                                    <p
                                                        className="text-xs text-indigo-600"
                                                        title={t('players.momentumTooltip')}
                                                    >
                                                        {t('players.momentumLabel')}:{' '}
                                                        {momentum > 0 ? '+' : ''}
                                                        {momentum.toFixed(1)}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex gap-2 text-xs font-semibold">
                                                <button
                                                    onClick={() => startEditingPlayer(player)}
                                                    className="text-indigo-600"
                                                >
                                                    {t('actions.edit')}
                                                </button>
                                                <button
                                                    onClick={() => handleDeletePlayer(player.id)}
                                                    className="text-red-500"
                                                >
                                                    {t('actions.remove')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <div>
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-slate-900 dark:text-white">
                                {t('players.temporaryTitle')}
                            </h3>
                            <button
                                onClick={toggleAllTemporarySelections}
                                disabled={!temporaryPlayers.length}
                                className="text-xs font-semibold text-indigo-600 disabled:text-slate-400"
                            >
                                {temporaryPlayers.length > 0 &&
                                selectedTemporaryIds.size === temporaryPlayers.length
                                    ? t('actions.clearAll')
                                    : t('actions.selectAll')}
                            </button>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t('players.temporaryHelp')}
                        </p>
                        <form
                            onSubmit={handleAddTemporaryPlayer}
                            className="mt-3 flex flex-col gap-3"
                        >
                            <input
                                className="rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                placeholder={t('players.namePlaceholder')}
                                value={tempName}
                                onChange={(e) => setTempName(e.target.value)}
                            />
                            <SkillSelector
                                name="new-temp-skill"
                                value={tempSkill}
                                onChange={setTempSkill}
                            />
                            <button
                                type="submit"
                                disabled={!tempName.trim()}
                                className="rounded-xl border border-dashed border-indigo-300 px-4 py-2 text-sm font-semibold text-indigo-600 disabled:border-slate-200 disabled:text-slate-500 dark:border-indigo-500 dark:disabled:border-slate-600 dark:disabled:text-slate-400"
                            >
                                {t('actions.addTemporary')}
                            </button>
                        </form>
                        <div
                            className="mt-4 space-y-2"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={(e) => handleTemporaryDrop(e)}
                        >
                            {temporaryPlayers.map((player, index) => {
                                const selected = selectedTemporaryIds.has(player.id);
                                return (
                                    <div
                                        key={player.id}
                                        className={`flex items-center justify-between rounded-2xl border px-3 py-2 ${
                                            selected
                                                ? 'border-indigo-200 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-500/20'
                                                : 'border-slate-100 bg-white dark:border-slate-700 dark:bg-slate-800/60'
                                        }`}
                                        draggable
                                        onDragStart={(e) =>
                                            beginDrag(e, {
                                                type: 'temporary',
                                                tempId: player.id,
                                                fromList: 'temporary',
                                            })
                                        }
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => handleTemporaryDrop(e, index)}
                                    >
                                        {editingTempId === player.id ? (
                                            <form
                                                onSubmit={handleUpdateTemporaryPlayer}
                                                className="flex w-full flex-col gap-2"
                                            >
                                                <input
                                                    className="rounded-xl border border-slate-200 px-2 py-1 text-sm dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                                    value={editingTempName}
                                                    onChange={(e) => setEditingTempName(e.target.value)}
                                                />
                                                <SkillSelector
                                                    name={`edit-temp-${player.id}`}
                                                    compact
                                                    value={editingTempSkill}
                                                    onChange={setEditingTempSkill}
                                                />
                                                <div className="flex gap-2">
                                                    <button
                                                        type="submit"
                                                        className="rounded-xl bg-indigo-600 px-3 py-1 text-xs font-semibold text-white disabled:bg-slate-200 dark:disabled:bg-slate-700"
                                                        disabled={!editingTempName.trim()}
                                                    >
                                                        {t('actions.saveChanges')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={cancelTempEditing}
                                                        className="rounded-xl border border-slate-200 px-3 py-1 text-xs font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-200"
                                                    >
                                                        {t('actions.cancel')}
                                                    </button>
                                                </div>
                                            </form>
                                        ) : (
                                            <>
                                                <div>
                                                <label className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200">
                                                        <input
                                                            type="checkbox"
                                                            checked={selected}
                                                            onChange={() =>
                                                                toggleTemporarySelectionState(player.id)
                                                            }
                                                        />
                                                        {player.name}
                                                    </label>
                                                    <p className="text-xs text-slate-400 dark:text-slate-500">
                                                        {t('players.skillLabel')}: {player.skill}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2 text-xs font-semibold">
                                                    <button
                                                        onClick={() => startEditingTempPlayer(player)}
                                                        className="text-indigo-600"
                                                    >
                                                        {t('actions.edit')}
                                                    </button>
                                                    <button
                                                        onClick={() => handleRemoveTemporaryPlayer(player.id)}
                                                        className="text-red-500"
                                                    >
                                                        {t('actions.remove')}
                                                    </button>
                                                </div>
                                            </>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </section>

                <section className="flex flex-col gap-6 rounded-3xl border border-slate-200 bg-white/70 p-6 shadow dark:border-slate-700 dark:bg-slate-900/70">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                            {t('teams.title')}
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            {t('teams.balanceInfo')}
                        </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                {t('teams.playersPerTeam')}
                            </label>
                            <input
                                type="number"
                                min={1}
                                value={playersPerTeam}
                                onChange={(e) => {
                                    const value = Math.max(1, Number(e.target.value));
                                    setPlayersPerTeam(value);
                                    setTeams({ teamA: [], teamB: [] });
                                }}
                                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                            />
                            <p className="text-xs text-slate-400 dark:text-slate-500">
                                {t('teams.playersPerTeamHelp')}
                            </p>
                        </div>
                        <div className="flex flex-col gap-2">
                            {(['teamA', 'teamB'] as const).map((teamKey) => (
                                <div key={teamKey}>
                                    <label className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                        {t('teams.teamName')} (
                                        {teamKey === 'teamA' ? t('teams.teamA') : t('teams.teamB')})
                                    </label>
                                    <input
                                        value={teamNames[teamKey]}
                                        onChange={(e) =>
                                            setTeamNames((prev) => ({
                                                ...prev,
                                                [teamKey]: e.target.value,
                                            }))
                                        }
                                        className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                            {t('players.selectedCount', {
                                count: selectedPlayers.length,
                            })}
                        </p>
                        {!canGenerateTeams && (
                            <p className="text-sm text-red-500">
                                {t('teams.notEnoughPlayers', {
                                    needed: Math.max(0, requiredPlayers - selectedPlayers.length),
                                })}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={handleGenerateTeams}
                            disabled={!canGenerateTeams}
                            className="rounded-2xl bg-indigo-600 px-4 py-2 font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                        >
                            {t('actions.generateTeams')}
                        </button>
                        <button
                            onClick={handleRerollTeams}
                            disabled={!teamsReady}
                            className="rounded-2xl border border-slate-200 px-4 py-2 font-semibold text-slate-600 transition hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 dark:border-slate-600 dark:text-slate-200 dark:hover:border-indigo-400 dark:hover:text-indigo-300 dark:disabled:border-slate-600 dark:disabled:text-slate-500"
                        >
                            {t('actions.reroll')}
                        </button>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        {renderTeamCard('teamA')}
                        {renderTeamCard('teamB')}
                    </div>

                    {fairnessWarning && (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-400 dark:bg-amber-900/40 dark:text-amber-200">
                            {t('teams.fairnessWarning', {
                                diff: fairnessDiff.toFixed(1),
                            })}
                        </div>
                    )}

                    <div className="flex items-center justify-between rounded-2xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/60">
                        <p className="text-sm font-semibold text-slate-600 dark:text-slate-200">
                            {t('actions.scoreMatch')}
                        </p>
                        <button
                            onClick={openResultModal}
                            disabled={!teamsReady}
                            className="rounded-2xl bg-green-600 px-4 py-2 font-semibold text-white transition hover:bg-green-500 disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
                        >
                            {t('actions.saveMatch')}
                        </button>
                    </div>
                </section>
            </div>

            <section className="rounded-3xl border border-slate-200 bg-white/70 p-6 shadow dark:border-slate-700 dark:bg-slate-900/70">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
                        {t('matches.title')}
                    </h2>
                </div>
                {matchesLoading && (
                    <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                        {t('loading.matches')}
                    </p>
                )}
                {!matchesLoading && matches.length === 0 && (
                    <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
                        {t('matches.empty')}
                    </p>
                )}
                <div className="mt-4 space-y-4">
                    {matches.map((match) => (
                        <div
                            key={match.id}
                            className="rounded-2xl border border-slate-100 bg-white p-4 dark:border-slate-700 dark:bg-slate-900"
                        >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-500 dark:text-slate-400">
                                <span>{new Date(match.created_at).toLocaleString()}</span>
                                <span>
                                    {winnerLabel(match.winner)} · {match.teamA_score} -{' '}
                                    {match.teamB_score}
                                </span>
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                                {[match.teamA, match.teamB].map((team, index) => (
                                    <div
                                        key={`${match.id}-${index}`}
                                        className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/60"
                                    >
                                        <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                            {index === 0
                                                ? match.teamA_score
                                                : match.teamB_score}{' '}
                                            ·{' '}
                                            {index === 0
                                                ? teamNames.teamA || t('teams.teamA')
                                                : teamNames.teamB || t('teams.teamB')}
                                        </p>
                                        <ul className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300">
                                            {team.map((player) => (
                                                <li key={`${player.name}-${player.skill}`}>
                                                    {player.name} · {player.skill}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2 text-sm">
                                <button
                                    onClick={() => openEditResultModal(match)}
                                    className="rounded-full border border-indigo-200 px-3 py-1 text-indigo-600 dark:border-indigo-500"
                                >
                                    {t('matches.editResult')}
                                </button>
                                <button
                                    onClick={() => handleDeleteMatch(match.id)}
                                    className="rounded-full border border-red-200 px-3 py-1 text-red-600 dark:border-red-700 dark:text-red-300"
                                >
                                    {t('actions.deleteMatch')}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <MatchResultModal
                open={resultModalOpen}
                teamNames={teamNames}
                initialScores={
                    resultModalMode === 'edit' && matchBeingEdited
                        ? {
                              teamA: matchBeingEdited.teamA_score,
                              teamB: matchBeingEdited.teamB_score,
                          }
                        : undefined
                }
                onClose={() => setResultModalOpen(false)}
                onConfirm={handleModalConfirm}
            />
        </div>
    );
};

export default Dashboard;
class ApiError extends Error {
    status: number;

    constructor(message: string, status: number) {
        super(message);
        this.status = status;
    }
}
