export const MAP_POOL = {
    Valorant: [
        // All standard 5v5 maps (Unrated / Competitive / Customs) as of 2025-11 :contentReference[oaicite:0]{index=0}
        'Abyss',
        'Ascent',
        'Bind',
        'Breeze',
        'Corrode',
        'Fracture',
        'Haven',
        'Icebox',
        'Lotus',
        'Pearl',
        'Split',
        'Sunset',
    ],

    'League of Legends': [
        // All main PC maps still playable in modern queues / customs :contentReference[oaicite:1]{index=1}
        "Summoner's Rift",
        'Howling Abyss',
        'Nexus Blitz',
        'Arena', // covers all Arena “rings”
    ],

    'Counter-Strike 2': [
        // All current official CS2 maps in rotation (defusal, hostage, Wingman & Arms Race) as of late 2025 :contentReference[oaicite:2]{index=2}

        // Active Duty (Premier / pro map pool)
        'Ancient',
        'Dust II',
        'Inferno',
        'Mirage',
        'Nuke',
        'Overpass',
        'Train',

        // Reserve / competitive defusal (still available in other modes/customs)
        'Anubis',
        'Vertigo',
        'Basalt',
        'Edin',

        // Community defusal maps promoted to official playlists
        'Palacio',
        'Golden',

        // Hostage maps
        'Office',
        'Italy',
        'Agency',

        // Wingman-exclusive maps
        'Palais',
        'Whistle',
        'Rooftop',
        'Transit',

        // Arms Race-exclusive maps
        'Baggage',
        'Shoots',
        'Pool Day',
    ],

    'Rocket League': [
        // All standard “soccar” arenas (no alt/Mutator layouts) :contentReference[oaicite:3]{index=3}
        'AquaDome',
        'Beckwith Park',
        'Champions Field',
        'Deadeye Canyon',
        'DFH Stadium',
        'Estadio Vida',
        'Farmstead',
        'Forbidden Temple',
        'Mannfield',
        'Neo Tokyo',
        'Neon Fields',
        'Rivals Arena',
        'Salty Shores',
        'Sovereign Heights',
        'Starbase ARC',
        'Urban Central',
        'Utopia Coliseum',
        'Wasteland',
    ],

    'Overwatch 2': [
        // All standard PvP maps in Unranked/Competitive: Control, Hybrid, Escort, Push, Flashpoint, Clash :contentReference[oaicite:4]{index=4}

        // Control
        'Control - Antarctic Peninsula',
        'Control - Busan',
        'Control - Ilios',
        'Control - Lijiang Tower',
        'Control - Nepal',
        'Control - Oasis',
        'Control - Samoa',

        // Escort
        'Escort - Circuit Royal',
        'Escort - Dorado',
        'Escort - Havana',
        'Escort - Junkertown',
        'Escort - Rialto',
        'Escort - Route 66',
        'Escort - Shambali Monastery',
        'Escort - Watchpoint: Gibraltar',

        // Hybrid
        'Hybrid - Blizzard World',
        'Hybrid - Eichenwalde',
        'Hybrid - Hollywood',
        "Hybrid - King's Row",
        'Hybrid - Midtown',
        'Hybrid - Numbani',
        'Hybrid - Paraíso',

        // Push
        'Push - Colosseo',
        'Push - Esperança',
        'Push - New Queen Street',
        'Push - Runasapi',

        // Flashpoint
        'Flashpoint - Aatlis',
        'Flashpoint - New Junk City',
        'Flashpoint - Suravasa',

        // Clash
        'Clash - Hanaoka',
        'Clash - Throne of Anubis',
    ],

    'Rainbow Six Siege': [
        // All maps in the Operation Daybreak-era selection (Quick, Ranked, TDM, Unranked, Dual Front) :contentReference[oaicite:5]{index=5}
        'Clubhouse',
        'Bank',
        'Kafe Dostoyevsky',
        'Chalet',
        'Border',
        'District',
        'Stadium Alpha',
        'Stadium Bravo',
        'Lair',
        'Nighthaven Labs',
        'Close Quarter',
        'Emerald Plains',
        'Coastline',
        'Consulate',
        'Favela',
        'Fortress',
        'Hereford Base',
        'House',
        'Kanal',
        'Oregon',
        'Outback',
        'Presidential Plane',
        'Skyscraper',
        'Theme Park',
        'Tower',
        'Villa',
        'Yacht',
    ],

    'Super Smash Bros. Melee': [
        // All distinct versus-mode stages (starting, unlockable, Battlefield/FD, past) :contentReference[oaicite:6]{index=6}
        'Battlefield',
        'Final Destination',
        'Brinstar',
        'Corneria',
        'Venom',
        'Fountain of Dreams',
        'Great Bay',
        'Green Greens',
        'Temple',
        'Icicle Mountain',
        'Jungle Japes',
        'Kongo Jungle',
        'Mushroom Kingdom',
        'Mute City',
        'Onett',
        'Pokémon Stadium',
        "Princess Peach's Castle",
        'Rainbow Cruise',
        "Yoshi's Island",
        "Yoshi's Story",
        'Brinstar Depths',
        'Fourside',
        'Big Blue',
        'Poké Floats',
        'Mushroom Kingdom II',
        'Flat Zone',
        'Dream Land',
    ],

    'Super Smash Bros. Ultimate': [
        // Common competitive / “legal” stages (good for customs without all 100+ chaos) :contentReference[oaicite:7]{index=7}
        'Battlefield',
        'Small Battlefield',
        'Final Destination',
        'Pokémon Stadium 2',
        'Smashville',
        'Town & City',
        'Kalos Pokémon League',
        "Yoshi's Story",
        'Lylat Cruise',
        'Hollow Bastion',
        'Northern Cave',
    ],
} as const;

export type GameTitle = keyof typeof MAP_POOL;

export const DEFAULT_GAME: GameTitle = 'Valorant';

export const GAME_TITLES = Object.keys(MAP_POOL) as GameTitle[];
