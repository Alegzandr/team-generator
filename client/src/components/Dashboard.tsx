import { DragEvent, FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toPng } from 'html-to-image';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useToast } from '../context/ToastContext';
import { DEFAULT_GAME, GAME_TITLES, MAP_POOL, type GameTitle } from '../data/maps';
import type {
    MapPreferences,
    Match,
    Player,
    TeamPlayer,
    TemporaryPlayer,
    Winner,
} from '../types';
import { TeamAssignment, balanceTeams, getTeamStats } from '../utils/teamBalancer';
import SkillSelector from './SkillSelector';
import MatchResultModal from './MatchResultModal';

const API_URL = import.meta.env.VITE_API_URL || '';
const MOMENTUM_WINDOW_MS = 1000 * 60 * 60 * 4;
const MAP_REPEAT_WINDOW_MS = 1000 * 60 * 60 * 4;
const MOMENTUM_STEP = 0.5;
const FAIRNESS_THRESHOLD = 3;
const DEFAULT_TEAM_NAMES = { teamA: 'Attackers', teamB: 'Defenders' };
const DRAG_DATA_FORMAT = 'application/x-team-generator';
const DASHBOARD_SETTINGS_KEY = 'team-generator:dashboard-settings';
const PLAYERS_PAGE_SIZE = 20;
const createDefaultMapPreferences = (): MapPreferences => ({ banned: {} });

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

const calculateMomentumMap = (
    matches: Match[],
    options?: { filterGame?: string | null }
) => {
    const now = Date.now();
    const map: Record<string, number> = {};
    const filterGame = options?.filterGame;

    matches.forEach((match) => {
        if (filterGame && match.game !== filterGame) {
            return;
        }
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

    const storedSettings = useMemo(() => loadDashboardSettings(), []);

    const [players, setPlayers] = useState<Player[]>([]);
    const [playersLoading, setPlayersLoading] = useState(false);
    const [playersLoadingMore, setPlayersLoadingMore] = useState(false);
    const [playersHasMore, setPlayersHasMore] = useState(true);
    const [matches, setMatches] = useState<Match[]>([]);
    const [matchesLoading, setMatchesLoading] = useState(false);
    const [momentumEnabled, setMomentumEnabled] = useState(
        storedSettings.momentumEnabled !== false
    );
    const [mapSelectionEnabled, setMapSelectionEnabled] = useState(
        Boolean(storedSettings.mapSelectionEnabled)
    );
    const [selectedGame, setSelectedGame] = useState<GameTitle>(() => {
        const storedGame = storedSettings.selectedGame;
        if (storedGame && (GAME_TITLES as readonly string[]).includes(storedGame)) {
            return storedGame;
        }
        return DEFAULT_GAME;
    });
    const [selectedMap, setSelectedMap] = useState<string | null>(
        typeof storedSettings.selectedMap === 'string' ? storedSettings.selectedMap : null
    );
    const [mapPreferences, setMapPreferences] = useState<MapPreferences>(createDefaultMapPreferences());
    const [mapPreferencesLoading, setMapPreferencesLoading] = useState(false);
    const [mapPreferencesSaving, setMapPreferencesSaving] = useState(false);
    const [temporaryPlayers, setTemporaryPlayers] = useState<TemporaryPlayer[]>([]);
    const [selectedPlayerIds, setSelectedPlayerIds] = useState<Set<number>>(new Set());
    const [selectedTemporaryIds, setSelectedTemporaryIds] = useState<Set<string>>(
        new Set()
    );
    const [playerName, setPlayerName] = useState('');
    const [playerSkill, setPlayerSkill] = useState(5);
    const [tempName, setTempName] = useState('');
    const [tempSkill, setTempSkill] = useState(5);
    const sanitizeTeamNames = () => {
        const stored = storedSettings.teamNames;
        if (!stored) return DEFAULT_TEAM_NAMES;
        return {
            teamA: stored.teamA?.trim() || DEFAULT_TEAM_NAMES.teamA,
            teamB: stored.teamB?.trim() || DEFAULT_TEAM_NAMES.teamB,
        };
    };

    const sanitizePlayersPerTeam = (value?: number) => {
        if (typeof value === 'number' && Number.isFinite(value) && value >= 1) {
            return Math.round(value);
        }
        return 5;
    };

    const [playersPerTeam, setPlayersPerTeam] = useState(
        sanitizePlayersPerTeam(storedSettings.playersPerTeam)
    );
    const [teamNames, setTeamNames] = useState(sanitizeTeamNames);
    const [copyingTeams, setCopyingTeams] = useState(false);
    const [teamsLocked, setTeamsLocked] = useState(false);

    const playersListRef = useRef<HTMLDivElement>(null);
    const playersLengthRef = useRef(0);
    const playersHasMoreRef = useRef(true);
    const teamsSnapshotRef = useRef<HTMLDivElement>(null);
    const matchCardRefs = useRef<Record<number, HTMLDivElement | null>>({});
    const [copyingMatchIds, setCopyingMatchIds] = useState<Set<number>>(new Set());
    const copyingTeamsRef = useRef(false);
    const [teams, setTeams] = useState<TeamAssignment>({ teamA: [], teamB: [] });
    const [editingPlayerId, setEditingPlayerId] = useState<number | null>(null);
    const [editingName, setEditingName] = useState('');
    const [editingSkill, setEditingSkill] = useState(5);
    const [editingTempId, setEditingTempId] = useState<string | null>(null);
    const [editingTempName, setEditingTempName] = useState('');
    const [editingTempSkill, setEditingTempSkill] = useState(5);
    const [convertingTempIds, setConvertingTempIds] = useState<Set<string>>(new Set());
    const [resultModalOpen, setResultModalOpen] = useState(false);
    const [resultModalMode, setResultModalMode] = useState<'new' | 'edit'>('new');
    const [matchBeingEdited, setMatchBeingEdited] = useState<Match | null>(null);

    const activeMomentumGame = mapSelectionEnabled ? selectedGame : undefined;

    const momentumMap = useMemo(
        () =>
            momentumEnabled
                ? calculateMomentumMap(matches, { filterGame: activeMomentumGame })
                : {},
        [matches, momentumEnabled, activeMomentumGame]
    );
    const mapOptions = useMemo<string[]>(
        () => [...(MAP_POOL[selectedGame] ?? [])],
        [selectedGame]
    );
    const bannedInSelectedGame: string[] = mapPreferences.banned[selectedGame] ?? [];
    const availableMapOptions = mapOptions.filter(
        (map) => !bannedInSelectedGame.includes(map)
    );

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

    const recentMapByGame = useMemo(() => {
        const now = Date.now();
        return matches.reduce(
            (acc, match) => {
                if (!match.game || !match.map) {
                    return acc;
                }
                const playedAt = new Date(match.created_at).getTime();
                if (Number.isNaN(playedAt) || now - playedAt > MAP_REPEAT_WINDOW_MS) {
                    return acc;
                }
                const existing = acc[match.game];
                if (!existing || playedAt > existing.playedAt) {
                    acc[match.game] = { map: match.map, playedAt };
                }
                return acc;
            },
            {} as Record<string, { map: string; playedAt: number }>
        );
    }, [matches]);

    const requiredPlayers = playersPerTeam * 2;
    const canGenerateTeams = selectedPlayers.length >= requiredPlayers;
    const teamsReady =
        teams.teamA.length === playersPerTeam && teams.teamB.length === playersPerTeam;
    const mapUnavailable = mapSelectionEnabled && availableMapOptions.length === 0;
    const mapReady = !mapSelectionEnabled || (!mapUnavailable && Boolean(selectedMap));
    const canSaveMatch = teamsReady && mapReady;
    const fairnessDiff = teamsReady
        ? Math.abs(
              getTeamStats(teams.teamA).totalSkill - getTeamStats(teams.teamB).totalSkill
          )
        : 0;
    const fairnessWarning = teamsReady && fairnessDiff > FAIRNESS_THRESHOLD;

    const apiRequest = useCallback(
        async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
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
        },
        [logout]
    );

    const ensureMatchReady = () => {
        if (!teamsReady) {
            pushToast(
                t('teams.notEnoughPlayers', {
                    needed: Math.max(0, requiredPlayers - selectedPlayers.length),
                }),
                'error'
            );
            return false;
        }
        if (mapSelectionEnabled) {
            if (mapUnavailable) {
                pushToast(
                    t('maps.noAvailableShort', { game: selectedGame }),
                    'error'
                );
                return false;
            }
            if (!selectedMap) {
                pushToast(t('maps.mapRequired'), 'error');
                return false;
            }
        }
        return true;
    };

    const allowedMapsForGame = (game: GameTitle): string[] => {
        const pool = [...(MAP_POOL[game] ?? [])];
        const banned: string[] = mapPreferences.banned[game] ?? [];
        return pool.filter((map) => !banned.includes(map));
    };

    const pickMapForGame = (
        game: GameTitle,
        extraExclude: Array<string | null | undefined> = []
    ) => {
        const options = allowedMapsForGame(game);
        if (!options.length) {
            return null;
        }
        const exclusions = new Set<string>();
        extraExclude.forEach((entry) => {
            if (entry) {
                exclusions.add(entry);
            }
        });
        const lastPlayed = recentMapByGame[game]?.map;
        if (lastPlayed) {
            exclusions.add(lastPlayed);
        }
        const available = options.filter((map) => !exclusions.has(map));
        const pool = available.length ? available : options;
        const randomIndex = Math.floor(Math.random() * pool.length);
        return pool[randomIndex] ?? null;
    };

    const handleRandomizeMap = () => {
        if (teamsLocked) {
            notifyTeamsLocked();
            return;
        }
        if (!mapSelectionEnabled) {
            setMapSelectionEnabled(true);
        }
        const next = pickMapForGame(selectedGame, [selectedMap]);
        if (!next) {
            pushToast(t('maps.noAvailableShort', { game: selectedGame }), 'error');
            return;
        }
        setSelectedMap(next);
    };

    const toggleMapSelection = () => {
        if (teamsLocked) {
            notifyTeamsLocked();
            return;
        }
        if (mapSelectionEnabled) {
            setMapSelectionEnabled(false);
            setSelectedMap(null);
            return;
        }
        const nextMap = pickMapForGame(selectedGame);
        if (!nextMap) {
            pushToast(t('maps.noAvailableShort', { game: selectedGame }), 'error');
        }
        setSelectedMap(nextMap);
        setMapSelectionEnabled(true);
    };

    const copyTeamsImage = async () => {
        if (copyingTeamsRef.current) {
            return;
        }
        if (!teamsSnapshotRef.current) {
            pushToast(t('feedback.error'), 'error');
            return;
        }
        copyingTeamsRef.current = true;
        setCopyingTeams(true);
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        try {
            const result = await copyElementToClipboard(teamsSnapshotRef.current);
            if (result === 'copied') {
                pushToast(t('feedback.teamsCopied'), 'success');
            } else {
                pushToast(t('feedback.teamsDownloaded'), 'info');
            }
            setTeamsLocked(true);
        } catch (error) {
            console.error('Failed to copy teams image', error);
            pushToast(t('feedback.error'), 'error');
        } finally {
            setCopyingTeams(false);
            copyingTeamsRef.current = false;
        }
    };

    const handleToggleMapBan = async (game: GameTitle, mapName: string) => {
        if (teamsLocked) {
            notifyTeamsLocked();
            return;
        }
        const previousPreferences = mapPreferences;
        const bannedSet = new Set(previousPreferences.banned[game] ?? []);
        if (bannedSet.has(mapName)) {
            bannedSet.delete(mapName);
        } else {
            bannedSet.add(mapName);
        }
        const nextBanned = { ...previousPreferences.banned };
        const updatedList = Array.from(bannedSet);
        if (updatedList.length) {
            nextBanned[game] = updatedList;
        } else {
            delete nextBanned[game];
        }
        const nextPreferences: MapPreferences = { banned: nextBanned };
        setMapPreferences(nextPreferences);
        setMapPreferencesSaving(true);
        try {
            await apiRequest<MapPreferences>('/api/maps/preferences', {
                method: 'PUT',
                body: JSON.stringify(nextPreferences),
            });
        } catch (error) {
            setMapPreferences(previousPreferences);
            pushToast(t('feedback.error'), 'error');
        } finally {
            setMapPreferencesSaving(false);
        }
    };

    const handleGameChange = (value: GameTitle) => {
        if (teamsLocked) {
            notifyTeamsLocked();
            return;
        }
        setSelectedGame(value);
        const allowed = allowedMapsForGame(value);
        if (!mapSelectionEnabled) {
            setSelectedMap((prev) => (prev && allowed.includes(prev) ? prev : null));
            return;
        }
        if (selectedMap && allowed.includes(selectedMap)) {
            return;
        }
        const next = pickMapForGame(value);
        if (!next) {
            pushToast(t('maps.noAvailableShort', { game: value }), 'error');
        }
        setSelectedMap(next);
    };

    const fetchPlayers = useCallback(
        async (reset = false) => {
            if (!user) return;
            const limit = PLAYERS_PAGE_SIZE;
            const offset = reset ? 0 : playersLengthRef.current;
            if (!reset && !playersHasMoreRef.current) return;
            if (reset) {
                setPlayersLoading(true);
                setPlayersHasMore(true);
                playersHasMoreRef.current = true;
                playersLengthRef.current = 0;
                setPlayers([]);
            } else {
                setPlayersLoadingMore(true);
            }
            try {
                const data = await apiRequest<PlayersResponse>(
                    `/api/players?limit=${limit}&offset=${offset}`
                );
                setPlayers((prev) => {
                    const next = reset ? data.players : [...prev, ...data.players];
                    playersLengthRef.current = next.length;
                    return next;
                });
                const hasMore = offset + data.players.length < data.total;
                setPlayersHasMore(hasMore);
                playersHasMoreRef.current = hasMore;
            } catch {
                pushToast(t('feedback.error'), 'error');
            } finally {
                if (reset) {
                    setPlayersLoading(false);
                } else {
                    setPlayersLoadingMore(false);
                }
            }
        },
        [user, apiRequest, pushToast, t]
    );

    useEffect(() => {
        if (!user) {
            setPlayers([]);
            setMatches([]);
            setPlayersHasMore(true);
            playersHasMoreRef.current = true;
            playersLengthRef.current = 0;
            setMapPreferences(createDefaultMapPreferences());
            setMapSelectionEnabled(false);
            setSelectedMap(null);
            return;
        }

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

        const loadMapPreferences = async () => {
            setMapPreferencesLoading(true);
            try {
                const data = await apiRequest<MapPreferences>('/api/maps/preferences');
                setMapPreferences(data);
            } catch {
                setMapPreferences(createDefaultMapPreferences());
            } finally {
                setMapPreferencesLoading(false);
            }
        };

        fetchPlayers(true);
        loadMatches();
        loadMapPreferences();
    }, [user, t, pushToast, fetchPlayers]);

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

    useEffect(() => {
        playersLengthRef.current = players.length;
    }, [players.length]);

    useEffect(() => {
        playersHasMoreRef.current = playersHasMore;
    }, [playersHasMore]);

    const registerMatchCardRef = useCallback((matchId: number, element: HTMLDivElement | null) => {
        if (element) {
            matchCardRefs.current[matchId] = element;
        } else {
            delete matchCardRefs.current[matchId];
        }
    }, []);

    useEffect(() => {
        const container = playersListRef.current;
        if (!container) return;
        const handleScroll = () => {
            if (playersLoading || playersLoadingMore) return;
            if (!playersHasMoreRef.current) return;
            if (
                container.scrollTop + container.clientHeight >=
                container.scrollHeight - 40
            ) {
                fetchPlayers(false);
            }
        };
        container.addEventListener('scroll', handleScroll);
        return () => container.removeEventListener('scroll', handleScroll);
    }, [fetchPlayers, playersLoading, playersLoadingMore]);

    useEffect(() => {
        persistDashboardSettings({
            teamNames,
            playersPerTeam,
            mapSelectionEnabled,
            selectedGame,
            selectedMap,
            momentumEnabled,
        });
    }, [
        teamNames,
        playersPerTeam,
        mapSelectionEnabled,
        selectedGame,
        selectedMap,
        momentumEnabled,
    ]);

    useEffect(() => {
        if (!mapSelectionEnabled) {
            setSelectedMap(null);
        }
    }, [mapSelectionEnabled]);

    useEffect(() => {
        if (!mapSelectionEnabled || !selectedMap) return;
        const bannedForGame = mapPreferences.banned[selectedGame] ?? [];
        if (
            bannedForGame.includes(selectedMap) ||
            !mapOptions.includes(selectedMap)
        ) {
            setSelectedMap(null);
        }
    }, [mapSelectionEnabled, mapPreferences, selectedMap, selectedGame, mapOptions]);

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
            setPlayerSkill(5);
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
        setEditingSkill(5);
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
        setEditingTempSkill(5);
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
        setTempSkill(5);
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


const notifyTeamsLocked = () => pushToast(t('teams.locked'), 'info');

const copyElementToClipboard = async (element: HTMLElement) => {
    const dataUrl = await toPng(element, {
        cacheBust: true,
        pixelRatio: window.devicePixelRatio || 2,
        backgroundColor: '#05060f',
    });
    const blob = await (await fetch(dataUrl)).blob();
    if (
        navigator.clipboard &&
        'write' in navigator.clipboard &&
        typeof ClipboardItem !== 'undefined'
    ) {
        const item = new ClipboardItem({ 'image/png': blob });
        await navigator.clipboard.write([item]);
        return 'copied' as const;
    }
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'teams.png';
    link.click();
    return 'downloaded' as const;
};

    const regenerateTeams = () => {
        if (teamsLocked) {
            notifyTeamsLocked();
            return;
        }
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
        if (teamsLocked) {
            notifyTeamsLocked();
            return;
        }
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
        if (teamsLocked) {
            notifyTeamsLocked();
            return;
        }
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
        if (teamsLocked) {
            event.preventDefault();
            notifyTeamsLocked();
            return;
        }
        beginDrag(event, { type: 'team', from, player });
    };

    const handleDropOnTeam = (
        event: DragEvent<HTMLElement>,
        target: 'teamA' | 'teamB',
        targetPlayer?: TeamPlayer
    ) => {
        if (teamsLocked) {
            event.preventDefault();
            notifyTeamsLocked();
            return;
        }
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

    const persistMatch = async (
        status: 'completed' | 'canceled',
        scores: { teamA: number; teamB: number }
    ) => {
        try {
            const match = await apiRequest<Match>('/api/matches', {
                method: 'POST',
                body: JSON.stringify({
                    teamA: sanitizeTeam(teams.teamA),
                    teamB: sanitizeTeam(teams.teamB),
                    teamA_score: scores.teamA,
                    teamB_score: scores.teamB,
                    game: mapSelectionEnabled ? selectedGame : null,
                    map: mapSelectionEnabled ? selectedMap : null,
                    status,
                }),
            });
            setMatches((prev) => [match, ...prev]);
            setTeamsLocked(false);
            pushToast(
                status === 'canceled' ? t('feedback.canceled') : t('feedback.saved'),
                status === 'canceled' ? 'info' : 'success'
            );
        } catch (error) {
            pushToast(t('feedback.error'), 'error');
        }
    };

    const handleSaveMatch = async (scores: { teamA: number; teamB: number }) => {
        if (!ensureMatchReady()) {
            return;
        }
        await persistMatch('completed', scores);
    };

    const copyMatchImage = async (matchId: number) => {
        const node = matchCardRefs.current[matchId];
        if (!node) {
            pushToast(t('feedback.error'), 'error');
            return;
        }
        setCopyingMatchIds((prev) => new Set(prev).add(matchId));
        try {
            const result = await copyElementToClipboard(node);
            if (result === 'copied') {
                pushToast(t('feedback.matchCopied'), 'success');
            } else {
                pushToast(t('feedback.matchDownloaded'), 'info');
            }
        } catch (error) {
            console.error('Failed to copy match image', error);
            pushToast(t('feedback.error'), 'error');
        } finally {
            setCopyingMatchIds((prev) => {
                const next = new Set(prev);
                next.delete(matchId);
                return next;
            });
        }
    };

    const handleCancelMatch = async () => {
        if (!teamsLocked) {
            notifyTeamsLocked();
            return;
        }
        if (!window.confirm(t('matches.cancelConfirm'))) {
            return;
        }
        await persistMatch('canceled', { teamA: 0, teamB: 0 });
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
        if (!ensureMatchReady()) {
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
                className="valorant-card border-white/20 bg-white/10 text-white"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => handleDropOnTeam(e, teamKey)}
            >
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-xs tracking-[0.15em] text-slate-200">{label}</p>
                        <h3 className="text-xl font-semibold text-white">
                            {teamNames[teamKey]}
                        </h3>
                    </div>
                    <div className="text-right text-sm text-slate-100">
                        <p>
                            {t('teams.average')}: {stats.averageSkill}
                        </p>
                        <p>
                            {t('teams.totalSkill')}: {stats.totalSkill}
                        </p>
                    </div>
                </div>
                {!(teamsLocked || copyingTeams) && (
                    <p className="mt-2 text-xs tracking-[0.12em] text-slate-200">
                        {t('teams.manualMove')}
                    </p>
                )}
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
                            className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:border-[#ff4655]/70 hover:bg-[#ff4655]/10"
                        >
                            <div>
                                <p className="font-semibold text-white">{player.name}</p>
                                {typeof player.momentum === 'number' && player.momentum !== 0 && (
                                    <span className="text-xs text-cyan-300">
                                        {t('players.momentumLabel')}:{' '}
                                        {player.momentum > 0 ? '+' : ''}
                                        {player.momentum}
                                    </span>
                                )}
                            </div>
                            <span className="text-sm font-semibold text-cyan-200">
                                {player.effectiveSkill ?? player.skill}
                            </span>
                        </button>
                    ))}
                    {teams[teamKey].length === 0 && (
                        <p className="text-sm text-slate-200">{t('teams.empty')}</p>
                    )}
                </div>
            </div>
        );
    };

    return (
        <div className="app-shell flex flex-col gap-10 py-12 text-white">
            <header className="valorant-panel valorant-panel--glow sticky top-4 z-10 border border-white/10 backdrop-blur supports-[backdrop-filter]:bg-white/5 shadow-[0_10px_30px_rgba(5,6,15,0.45)]">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                        {user?.avatar ? (
                            <img
                                src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`}
                                alt={user.username}
                                className="h-12 w-12 rounded-full border border-white/15"
                            />
                        ) : (
                            <div className="h-12 w-12 rounded-full bg-white/10" />
                        )}
                        <div>
                            <p className="text-xs tracking-[0.15em] text-slate-200">
                                {t('app.title')}
                            </p>
                            <p className="text-xl font-semibold text-white">{user?.username}</p>
                        </div>
                    </div>
                </div>
            </header>

            <div className="grid gap-6 lg:grid-cols-2">
                <section className="valorant-panel flex flex-col gap-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-xl font-semibold text-white">
                                {t('players.title')}
                            </h2>
                            <p className="text-sm text-slate-100">
                                {t('players.selectHelp')}
                            </p>
                        </div>
                        <button
                            className="text-xs font-semibold tracking-[0.12em] text-cyan-300 disabled:text-slate-500"
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
                            <label className="text-xs tracking-[0.12em] text-slate-200">
                                {t('players.nameLabel')}
                            </label>
                            <input
                                className="valorant-input mt-1 w-full"
                                placeholder={t('players.namePlaceholder')}
                                value={playerName}
                                onChange={(e) => setPlayerName(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="text-xs tracking-[0.12em] text-slate-200">
                                {t('players.skillLabel')}
                            </label>
                            <div className="mt-2">
                                <SkillSelector
                                    name="new-player-skill"
                                    value={playerSkill}
                                    onChange={setPlayerSkill}
                                />
                            </div>
                            <p className="mt-1 text-xs text-slate-200">
                                {t('players.skillHelp')}
                            </p>
                        </div>
                        <button
                            type="submit"
                            disabled={!playerName.trim()}
                            className="valorant-btn-primary w-full justify-center px-6 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {t('actions.addPlayer')}
                        </button>
                    </form>

                    <div
                        ref={playersListRef}
                        className="max-h-[32rem] space-y-2 overflow-auto pr-2"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => handleSavedDrop(e)}
                    >
                        {playersLoading && (
                            <p className="text-sm text-slate-200">
                                {t('loading.players')}
                            </p>
                        )}
                        {!playersLoading && players.length === 0 && (
                            <p className="text-sm text-slate-200">
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
                                    className={`rounded-2xl border px-4 py-3 transition ${
                                        selected
                                            ? 'border-[#ff4655]/60 bg-[#ff4655]/12'
                                            : 'border-white/15 bg-white/10 hover:border-white/35'
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
                                                className="valorant-input px-3 py-2 text-sm"
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
                                                    className="valorant-btn-primary px-4 py-2 text-[0.6rem] disabled:opacity-60"
                                                    disabled={!editingName.trim()}
                                                >
                                                    {t('actions.saveChanges')}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={cancelEditing}
                                                    className="valorant-btn-outline px-4 py-2 text-[0.6rem]"
                                                >
                                                    {t('actions.cancel')}
                                                </button>
                                            </div>
                                        </form>
                                    ) : (
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <label className="flex items-center gap-2 text-sm font-semibold text-white">
                                                    <input
                                                        type="checkbox"
                                                        checked={selected}
                                                        onChange={() => togglePlayerSelection(player.id)}
                                                    />
                                                    {player.name}
                                                </label>
                                                <p className="text-xs text-slate-200">
                                                    {t('players.skillLabel')}: {player.skill}
                                                </p>
                                                {showMomentum && (
                                                    <p
                                                        className="text-xs text-cyan-300"
                                                        title={t('players.momentumTooltip')}
                                                    >
                                                        {t('players.momentumLabel')}:{' '}
                                                        {momentum > 0 ? '+' : ''}
                                                        {momentum.toFixed(1)}
                                                    </p>
                                                )}
                                            </div>
                                            <div className="flex gap-2 text-xs font-semibold tracking-[0.12em]">
                                                <button
                                                    onClick={() => startEditingPlayer(player)}
                                                    className="text-cyan-300"
                                                >
                                                    {t('actions.edit')}
                                                </button>
                                                <button
                                                    onClick={() => handleDeletePlayer(player.id)}
                                                    className="text-[#ff4655]"
                                                >
                                                    {t('actions.remove')}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {playersLoadingMore && (
                            <p className="py-2 text-center text-xs text-slate-300">
                                {t('loading.players')}
                            </p>
                        )}
                        {!playersLoading &&
                            !playersLoadingMore &&
                            !playersHasMore &&
                            players.length > 0 && (
                                <p className="py-2 text-center text-[0.65rem] uppercase tracking-[0.2em] text-slate-500">
                                    {t('players.allLoaded')}
                                </p>
                            )}
                    </div>

                    <div>
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-white">
                                {t('players.temporaryTitle')}
                            </h3>
                            <button
                                onClick={toggleAllTemporarySelections}
                                disabled={!temporaryPlayers.length}
                                className="text-xs font-semibold tracking-[0.12em] text-cyan-300 disabled:text-slate-500"
                            >
                                {temporaryPlayers.length > 0 &&
                                selectedTemporaryIds.size === temporaryPlayers.length
                                    ? t('actions.clearAll')
                                    : t('actions.selectAll')}
                            </button>
                        </div>
                        <p className="text-sm text-slate-200">
                            {t('players.temporaryHelp')}
                        </p>
                        <form
                            onSubmit={handleAddTemporaryPlayer}
                            className="mt-3 flex flex-col gap-3"
                        >
                            <input
                                className="valorant-input"
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
                                className="valorant-btn-outline border-dashed border-white/40 text-xs text-white disabled:opacity-60"
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
                                        className={`flex items-center justify-between rounded-2xl border px-4 py-2 transition ${
                                            selected
                                                ? 'border-[#ff4655]/60 bg-[#ff4655]/12'
                                                : 'border-white/15 bg-white/10 hover:border-white/35'
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
                                                    className="valorant-input px-3 py-2 text-sm"
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
                                                        className="valorant-btn-primary px-4 py-2 text-[0.6rem] disabled:opacity-60"
                                                        disabled={!editingTempName.trim()}
                                                    >
                                                        {t('actions.saveChanges')}
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={cancelTempEditing}
                                                        className="valorant-btn-outline px-4 py-2 text-[0.6rem]"
                                                    >
                                                        {t('actions.cancel')}
                                                    </button>
                                                </div>
                                            </form>
                                        ) : (
                                            <>
                                                <div>
                                                    <label className="flex items-center gap-2 text-sm font-semibold text-white">
                                                        <input
                                                            type="checkbox"
                                                            checked={selected}
                                                            onChange={() =>
                                                                toggleTemporarySelectionState(player.id)
                                                            }
                                                        />
                                                        {player.name}
                                                    </label>
                                                    <p className="text-xs text-slate-200">
                                                        {t('players.skillLabel')}: {player.skill}
                                                    </p>
                                                </div>
                                                <div className="flex gap-2 text-xs font-semibold tracking-[0.12em]">
                                                    <button
                                                        onClick={() => startEditingTempPlayer(player)}
                                                        className="text-cyan-300"
                                                    >
                                                        {t('actions.edit')}
                                                    </button>
                                                    <button
                                                        onClick={() => handleRemoveTemporaryPlayer(player.id)}
                                                        className="text-[#ff4655]"
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

                <section className="valorant-panel flex flex-col gap-6">
                    <div>
                        <h2 className="text-xl font-semibold text-white">
                            {t('teams.title')}
                        </h2>
                        <p className="text-sm text-slate-100">
                            {t('teams.balanceInfo')}
                        </p>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                        <div>
                            <label className="text-xs tracking-[0.12em] text-slate-200">
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
                                disabled={teamsLocked}
                                className="valorant-input mt-1 w-full disabled:cursor-not-allowed disabled:opacity-60"
                            />
                            <p className="text-xs text-slate-200">
                                {t('teams.playersPerTeamHelp')}
                            </p>
                        </div>
                        <div className="flex flex-col gap-2">
                            {(['teamA', 'teamB'] as const).map((teamKey) => (
                                <div key={teamKey}>
                                    <label className="text-xs tracking-[0.12em] text-slate-200">
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
                                        disabled={teamsLocked}
                                        className="valorant-input mt-1 w-full disabled:cursor-not-allowed disabled:opacity-60"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="valorant-card border-white/10 bg-white/5">
                        <p className="text-sm font-semibold text-white">
                            {t('players.selectedCount', {
                                count: selectedPlayers.length,
                            })}
                        </p>
                        {!canGenerateTeams && (
                            <p className="text-sm text-[#ff9aa4]">
                                {t('teams.notEnoughPlayers', {
                                    needed: Math.max(0, requiredPlayers - selectedPlayers.length),
                                })}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-wrap gap-3">
                        <button
                            onClick={handleGenerateTeams}
                            disabled={!canGenerateTeams || teamsLocked}
                            className="valorant-btn-primary px-6 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {t('actions.generateTeams')}
                        </button>
                        <button
                            onClick={handleRerollTeams}
                            disabled={!teamsReady || teamsLocked}
                            className="valorant-btn-outline px-6 py-3 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {t('actions.reroll')}
                        </button>
                        <button
                            type="button"
                            aria-label={t('actions.copyTeamsImage')}
                            title={t('actions.copyTeamsImage')}
                            onClick={copyTeamsImage}
                            disabled={!teamsReady}
                            className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-lg text-white transition hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            <span aria-hidden="true">📸</span>
                            <span className="sr-only">{t('actions.copyTeamsImage')}</span>
                        </button>
                    </div>
                    <div ref={teamsSnapshotRef}>
                        {mapSelectionEnabled && !mapUnavailable && selectedMap && (
                            <div className="mb-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-xs text-slate-100">
                                {t('maps.currentSelection', {
                                    game: selectedGame,
                                    map: selectedMap,
                                })}
                            </div>
                        )}
                        <div className="grid gap-4 md:grid-cols-2">
                            {renderTeamCard('teamA')}
                            {renderTeamCard('teamB')}
                        </div>

                        {fairnessWarning && (
                            <div className="mt-4 rounded-2xl border border-[#ff4655]/40 bg-[#ff4655]/10 p-4 text-sm text-white">
                                {t('teams.fairnessWarning', {
                                    diff: fairnessDiff.toFixed(1),
                                })}
                            </div>
                        )}
                    </div>

                    {teamsLocked && (
                        <div className="rounded-2xl border border-white/10 bg-[#ff4655]/15 p-4 text-xs text-white">
                            {t('teams.lockedNotice')}
                        </div>
                    )}

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="text-xs tracking-[0.15em] text-slate-200">
                                    {t('players.momentumToggleLabel')}
                                </p>
                                <p className="text-sm text-slate-200">
                                    {momentumEnabled
                                        ? mapSelectionEnabled
                                            ? t('players.momentumFiltered', { game: selectedGame })
                                            : t('players.momentumEnabled')
                                        : t('players.momentumDisabled')}
                                </p>
                            </div>
                            <button
                                type="button"
                                disabled={teamsLocked}
                                onClick={() => {
                                    if (teamsLocked) {
                                        notifyTeamsLocked();
                                        return;
                                    }
                                    setMomentumEnabled((prev) => !prev);
                                }}
                                className={`rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.12em] transition ${
                                    momentumEnabled
                                        ? 'border-[#ff5c8a]/40 bg-[#ff5c8a]/20 text-white shadow-[0_4px_16px_rgba(255,92,138,0.25)]'
                                        : 'border-white/15 bg-white/5 text-slate-200 hover:border-white/40 hover:text-white'
                                } disabled:cursor-not-allowed disabled:opacity-60`}
                            >
                                {momentumEnabled
                                    ? t('players.momentumDisable')
                                    : t('players.momentumEnable')}
                            </button>
                        </div>
                    </div>

                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                            <div>
                                <p className="text-xs tracking-[0.15em] text-slate-200">
                                    {t('maps.title')}
                                </p>
                                <p className="text-sm text-slate-200">
                                    {t('maps.description')}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={toggleMapSelection}
                                disabled={teamsLocked || copyingTeams}
                                className="valorant-btn-outline px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {mapSelectionEnabled ? t('maps.disable') : t('maps.enable')}
                            </button>
                        </div>
                        {mapSelectionEnabled && copyingTeams ? (
                            <p className="mt-3 text-sm text-slate-200">
                                {t('maps.hiddenWhileSharing')}
                            </p>
                        ) : mapSelectionEnabled ? (
                            <div className="mt-4 space-y-3">
                                <div>
                                    <label className="text-xs tracking-[0.12em] text-slate-200">
                                        {t('maps.gameLabel')}
                                    </label>
                                    <select
                                        className="valorant-input mt-1 w-full disabled:cursor-not-allowed disabled:opacity-60"
                                        value={selectedGame}
                                        onChange={(e) =>
                                            handleGameChange(e.target.value as GameTitle)
                                        }
                                        disabled={teamsLocked}
                                    >
                                        {GAME_TITLES.map((game) => (
                                            <option key={game} value={game}>
                                                {game}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                {mapOptions.length > 0 ? (
                                    <>
                                        <div>
                                            <label className="text-xs tracking-[0.12em] text-slate-200">
                                                {t('maps.mapLabel')}
                                            </label>
                                            <select
                                                className="valorant-input mt-1 w-full disabled:cursor-not-allowed disabled:opacity-60"
                                                value={selectedMap ?? ''}
                                                disabled={!availableMapOptions.length || teamsLocked}
                                                onChange={(e) =>
                                                    setSelectedMap(e.target.value || null)
                                                }
                                            >
                                                <option value="">
                                                    {availableMapOptions.length
                                                        ? t('maps.selectPlaceholder')
                                                        : t('maps.noAvailableShort', {
                                                              game: selectedGame,
                                                          })}
                                                </option>
                                                {availableMapOptions.map((mapName) => (
                                                    <option key={mapName} value={mapName}>
                                                        {mapName}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3">
                                            <button
                                                type="button"
                                                onClick={handleRandomizeMap}
                                                disabled={!availableMapOptions.length || teamsLocked}
                                                className="valorant-btn-outline px-4 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                                            >
                                                {t('maps.randomize')}
                                            </button>
                                            {recentMapByGame[selectedGame]?.map && (
                                                <p className="text-xs text-slate-300">
                                                    {t('maps.recentlyPlayed', {
                                                        map: recentMapByGame[selectedGame]!.map,
                                                    })}
                                                </p>
                                            )}
                                        </div>
                                        <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                                                <p className="text-xs tracking-[0.12em] text-slate-200">
                                                    {t('maps.manageTitle', { game: selectedGame })}
                                                </p>
                                                {mapPreferencesSaving && (
                                                    <span className="text-[0.65rem] uppercase tracking-[0.12em] text-slate-300">
                                                        {t('maps.saving')}
                                                    </span>
                                                )}
                                            </div>
                                            {mapPreferencesLoading ? (
                                                <p className="mt-2 text-sm text-slate-200">
                                                    {t('maps.loadingPreferences')}
                                                </p>
                                            ) : (
                                                <div className="mt-2 flex flex-wrap gap-2">
                                                    {mapOptions.map((mapName) => {
                                                        const banned = bannedInSelectedGame.includes(mapName);
                                                        return (
                                                            <button
                                                                type="button"
                                                                key={mapName}
                                                                disabled={mapPreferencesSaving || teamsLocked}
                                                                onClick={() =>
                                                                    handleToggleMapBan(selectedGame, mapName)
                                                                }
                                                                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                                                                    banned
                                                                        ? 'border-[#ff4655]/60 bg-[#ff4655]/10 text-[#ff9aa4]'
                                                                        : 'border-white/20 text-white hover:border-white/60'
                                                                } disabled:cursor-not-allowed disabled:opacity-60`}
                                                            >
                                                                {mapName}
                                                                <span className="ml-2 text-[0.6rem] uppercase tracking-[0.12em] text-slate-300">
                                                                    {banned
                                                                        ? t('maps.tagBanned')
                                                                        : t('maps.tagAllowed')}
                                                                </span>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            <p className="mt-2 text-xs text-slate-400">
                                                {t('maps.banHint')}
                                            </p>
                                        </div>
                                        {mapUnavailable && (
                                            <p className="text-xs text-[#ff9aa4]">
                                                {t('maps.noAvailable', { game: selectedGame })}
                                            </p>
                                        )}
                                        {!mapUnavailable && !selectedMap && (
                                            <p className="text-xs text-[#ff9aa4]">
                                                {t('maps.mapRequired')}
                                            </p>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-sm text-slate-200">
                                        {t('maps.noneAvailable')}
                                    </p>
                                )}
                            </div>
                        ) : (
                            <p className="mt-3 text-sm text-slate-200">
                                {t('maps.disabledDescription')}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-sm font-semibold text-white">
                                {t('actions.scoreMatch')}
                            </p>
                            <p className="text-xs text-slate-200">
                                {mapSelectionEnabled
                                    ? mapUnavailable
                                        ? t('maps.noAvailable', { game: selectedGame })
                                        : selectedMap
                                            ? t('maps.currentSelection', {
                                                  game: selectedGame,
                                                  map: selectedMap,
                                              })
                                            : t('maps.pending')
                                    : t('maps.notTracking')}
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            {teamsLocked && (
                                <button
                                    type="button"
                                    onClick={handleCancelMatch}
                                    className="valorant-btn-outline px-6 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                    {t('actions.cancelMatch')}
                                </button>
                            )}
                            <button
                                onClick={openResultModal}
                                disabled={!canSaveMatch}
                                className="valorant-btn-primary px-6 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {t('actions.saveMatch')}
                            </button>
                        </div>
                    </div>
                </section>
            </div>

            <section className="valorant-panel">
                <div className="flex items-center justify-between">
                    <h2 className="text-xl font-semibold text-white">{t('matches.title')}</h2>
                </div>
                {matchesLoading && (
                    <p className="mt-4 text-sm text-slate-200">{t('loading.matches')}</p>
                )}
                {!matchesLoading && matches.length === 0 && (
                    <p className="mt-4 text-sm text-slate-200">{t('matches.empty')}</p>
                )}
                <div className="mt-4 space-y-4">
                    {matches.map((match) => {
                        const isCanceled = match.status === 'canceled';
                        const statusLabel = isCanceled ? t('matches.canceled') : winnerLabel(match.winner);
                        const statusClasses = isCanceled ? 'text-[#ff9aa4]' : 'text-slate-200';
                        return (
                            <div
                                key={match.id}
                                ref={(el) => registerMatchCardRef(match.id, el)}
                                className="rounded-2xl border border-white/15 bg-white/10 p-4 text-slate-100"
                            >
                            <div className="flex flex-wrap items-center justify-between gap-2 text-xs tracking-[0.12em] text-slate-200">
                                <span>{new Date(match.created_at).toLocaleString()}</span>
                                <span className={statusClasses}>
                                    {statusLabel} · {match.teamA_score} - {match.teamB_score}
                                </span>
                            </div>
                            <div className="mt-2 text-sm text-white">
                                {match.game ? (
                                    <>
                                        {match.game}
                                        {match.map ? ` · ${match.map}` : ''}
                                    </>
                                ) : (
                                    <span className="text-slate-300">
                                        {t('maps.historyUnknown')}
                                    </span>
                                )}
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                                {[match.teamA, match.teamB].map((team, index) => (
                                    <div
                                        key={`${match.id}-${index}`}
                                        className="rounded-2xl border border-white/15 bg-white/10 p-3"
                                    >
                                        <p className="text-sm font-semibold text-white">
                                            {index === 0 ? match.teamA_score : match.teamB_score} ·{' '}
                                            {index === 0
                                                ? teamNames.teamA || t('teams.teamA')
                                                : teamNames.teamB || t('teams.teamB')}
                                        </p>
                                        <ul className="mt-2 space-y-1 text-sm text-slate-100">
                                            {team.map((player) => (
                                                <li key={`${player.name}-${player.skill}`}>
                                                    {player.name} · {player.skill}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>
                            {!copyingMatchIds.has(match.id) && (
                                <div className="mt-3 flex flex-wrap gap-2 text-xs tracking-[0.12em]">
                                    <button
                                        type="button"
                                        aria-label={t('actions.copyMatchImage')}
                                        title={t('actions.copyMatchImage')}
                                        disabled={isCanceled}
                                        onClick={() => copyMatchImage(match.id)}
                                        className="rounded-full border border-white/15 bg-white/5 px-3 py-2 text-lg text-white transition hover:border-white/40 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        <span aria-hidden="true">📸</span>
                                        <span className="sr-only">{t('actions.copyMatchImage')}</span>
                                    </button>
                                    <button
                                        onClick={() => openEditResultModal(match)}
                                        disabled={isCanceled}
                                        className="valorant-btn-outline px-4 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {t('matches.editResult')}
                                    </button>
                                    <button
                                        onClick={() => handleDeleteMatch(match.id)}
                                        className="valorant-btn-primary px-4 py-2"
                                    >
                                        {t('actions.deleteMatch')}
                                    </button>
                                </div>
                            )}
                        </div>
                    ); })}
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
            <footer className="valorant-panel flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                    <p className="text-xs tracking-[0.12em] text-slate-200">
                        {t('language.label')}
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                        {(['en', 'fr'] as const).map((lang) => (
                            <button
                                key={lang}
                                onClick={() => setLanguage(lang)}
                                className={`rounded-full border px-4 py-2 text-xs font-semibold tracking-[0.12em] transition ${
                                    language === lang
                                        ? 'border-[#ff5c8a]/40 bg-[#ff5c8a]/20 text-white shadow-[0_4px_16px_rgba(255,92,138,0.25)]'
                                        : 'border-white/15 bg-white/5 text-slate-200 hover:border-white/40 hover:text-white'
                                }`}
                            >
                                {lang.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => logout()}
                        className="valorant-btn-outline px-6 py-2 text-xs"
                    >
                        {t('actions.logout')}
                    </button>
                    <button
                        onClick={handleDeleteAccount}
                        className="valorant-btn-primary px-6 py-2 text-xs"
                    >
                        {t('actions.deleteAccount')}
                    </button>
                </div>
            </footer>
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
type DashboardSettings = {
    teamNames: typeof DEFAULT_TEAM_NAMES;
    playersPerTeam: number;
    mapSelectionEnabled: boolean;
    selectedGame: GameTitle;
    selectedMap: string | null;
    momentumEnabled: boolean;
};

type PlayersResponse = {
    players: Player[];
    total: number;
};

const loadDashboardSettings = (): Partial<DashboardSettings> => {
    if (typeof window === 'undefined') {
        return {};
    }
    try {
        const raw = window.localStorage.getItem(DASHBOARD_SETTINGS_KEY);
        if (!raw) return {};
        return JSON.parse(raw) as Partial<DashboardSettings>;
    } catch {
        return {};
    }
};

const persistDashboardSettings = (settings: DashboardSettings) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(DASHBOARD_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
        // ignore write failures (storage quota, private mode, etc.)
    }
};
