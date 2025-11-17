import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import dotenv from 'dotenv';

dotenv.config();

const resolveDatabasePath = () => {
    const dbPath = process.env.DATABASE_URL || './data/database.sqlite';
    if (path.isAbsolute(dbPath)) {
        return dbPath;
    }
    return path.join(__dirname, '..', dbPath);
};

const databasePath = resolveDatabasePath();
fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new sqlite3.Database(databasePath);

const ensureNetworkRecord = (networkId: string, done?: () => void) => {
    if (!networkId) {
        done?.();
        return;
    }
    db.run(
        `INSERT OR IGNORE INTO networks (id) VALUES (?)`,
        [networkId],
        (err) => {
            if (err && !err.message.includes('no such table')) {
                console.error('Failed to ensure network record:', err.message);
            }
            done?.();
        }
    );
};

const backfillUserNetworks = () => {
    db.all<{ id: string; network_id?: string | null }>(
        `SELECT id, network_id FROM users`,
        (err, rows) => {
            if (err) {
                if (!err.message.includes('no such table')) {
                    console.error('Failed to load users for network backfill:', err.message);
                }
                return;
            }
            rows?.forEach((row) => {
                const fallback = row.network_id && row.network_id.trim().length > 0
                    ? row.network_id
                    : row.id;
                ensureNetworkRecord(fallback, () => {
                    if (row.network_id === fallback) {
                        return;
                    }
                    db.run(
                        `UPDATE users SET network_id = ? WHERE id = ?`,
                        [fallback, row.id],
                        (updateErr) => {
                            if (updateErr) {
                                console.error(
                                    'Failed to backfill user network id:',
                                    updateErr.message
                                );
                            }
                        }
                    );
                });
            });
        }
    );
};

const backfillEntityNetwork = (table: 'players' | 'matches') => {
    db.run(
        `UPDATE ${table}
         SET network_id = (
             SELECT network_id FROM users WHERE users.id = ${table}.user_id
         )
         WHERE network_id IS NULL OR network_id = ''`,
        (err) => {
            if (err && !err.message.includes('no such table')) {
                console.error(`Failed to backfill ${table} network ids:`, err.message);
            }
        }
    );
};

const ensureMapPreferencesNetworkScope = () => {
    db.all<{
        name: string;
    }>(
        `PRAGMA table_info(map_preferences)`,
        (err, columns) => {
            if (err) {
                if (!err.message.includes('no such table')) {
                    console.error('Failed to inspect map_preferences table:', err.message);
                }
                return;
            }
            const hasTable = columns && columns.length > 0;
            const hasNetworkColumn = columns?.some((col) => col.name === 'network_id');
            const hasUserColumn = columns?.some((col) => col.name === 'user_id');

            if (!hasTable) {
                db.run(
                    `CREATE TABLE IF NOT EXISTS map_preferences (
                        network_id TEXT PRIMARY KEY,
                        preferences TEXT NOT NULL,
                        FOREIGN KEY(network_id) REFERENCES networks(id) ON DELETE CASCADE
                    )`
                );
                return;
            }

            if (!hasNetworkColumn) {
                db.run(`ALTER TABLE map_preferences ADD COLUMN network_id TEXT`, (alterErr) => {
                    if (
                        alterErr &&
                        !alterErr.message.includes('duplicate column name')
                    ) {
                        console.error(
                            'Failed to add network_id to map_preferences:',
                            alterErr.message
                        );
                    }
                });
            }

            if (hasUserColumn) {
                db.run(
                    `UPDATE map_preferences
                     SET network_id = (
                         SELECT network_id FROM users WHERE users.id = map_preferences.user_id
                     )
                     WHERE (network_id IS NULL OR network_id = '') AND user_id IS NOT NULL`,
                    (updateErr) => {
                        if (updateErr) {
                            console.error(
                                'Failed to backfill map preferences network ids:',
                                updateErr.message
                            );
                        }
                    }
                );
            }

            const createNewTable = () => {
                db.run(
                    `CREATE TABLE IF NOT EXISTS map_preferences_new (
                        network_id TEXT PRIMARY KEY,
                        preferences TEXT NOT NULL,
                        FOREIGN KEY(network_id) REFERENCES networks(id) ON DELETE CASCADE
                    )`
                );
                db.run(
                    `INSERT OR REPLACE INTO map_preferences_new (network_id, preferences)
                     SELECT network_id, preferences
                     FROM map_preferences
                     WHERE network_id IS NOT NULL AND network_id <> ''`,
                    (insertErr) => {
                        if (insertErr) {
                            console.error(
                                'Failed to migrate map preferences data:',
                                insertErr.message
                            );
                            return;
                        }
                        db.run(`DROP TABLE map_preferences`, (dropErr) => {
                            if (dropErr) {
                                console.error(
                                    'Failed to drop old map_preferences table:',
                                    dropErr.message
                                );
                                return;
                            }
                            db.run(
                                `ALTER TABLE map_preferences_new RENAME TO map_preferences`,
                                (renameErr) => {
                                    if (renameErr) {
                                        console.error(
                                            'Failed to finalize map_preferences migration:',
                                            renameErr.message
                                        );
                                    }
                                }
                            );
                        });
                    }
                );
            };

            if (hasUserColumn) {
                createNewTable();
            } else if (!hasNetworkColumn) {
                createNewTable();
            }
        }
    );
};

const PLAYERS_TABLE_DEFINITION = `(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        network_id TEXT NOT NULL,
        name TEXT NOT NULL,
        skill INTEGER NOT NULL CHECK(skill BETWEEN 0 AND 10),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(network_id) REFERENCES networks(id) ON DELETE CASCADE
    )`;

const createPlayersTable = (ifNotExists = true) => {
    const clause = ifNotExists ? 'IF NOT EXISTS ' : '';
    db.run(`CREATE TABLE ${clause}players ${PLAYERS_TABLE_DEFINITION}`);
};

const migratePlayerSkillConstraint = () => {
    const finalizeLegacyTable = (done: () => void) => {
        db.get(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='players_old'`,
            (legacyErr, legacyRow) => {
                if (legacyErr) {
                    console.error('Failed to inspect legacy players table:', legacyErr.message);
                    done();
                    return;
                }
                if (!legacyRow) {
                    done();
                    return;
                }
                db.get(
                    `SELECT name FROM sqlite_master WHERE type='table' AND name='players'`,
                    (currentErr, currentRow) => {
                        if (currentErr) {
                            console.error(
                                'Failed to inspect players table state:',
                                currentErr.message
                            );
                            done();
                            return;
                        }
                        const dropLegacy = () => {
                            db.run('DROP TABLE players_old', (dropErr) => {
                                if (dropErr) {
                                    console.error(
                                        'Failed to drop legacy players table:',
                                        dropErr.message
                                    );
                                }
                                done();
                            });
                        };
                        if (!currentRow) {
                            createPlayersTable(false);
                            db.run(
                                `INSERT INTO players (id, user_id, network_id, name, skill)
                                 SELECT
                                     id,
                                     user_id,
                                     (
                                         SELECT network_id
                                         FROM users
                                         WHERE users.id = players_old.user_id
                                     ) AS network_id,
                                     name,
                                     MIN(MAX(skill, 0), 10)
                                 FROM players_old`,
                                (copyErr) => {
                                    if (copyErr) {
                                        console.error(
                                            'Failed to copy legacy players data:',
                                            copyErr.message
                                        );
                                        done();
                                        return;
                                    }
                                    dropLegacy();
                                }
                            );
                            return;
                        }
                        dropLegacy();
                    }
                );
            }
        );
    };

    finalizeLegacyTable(() => {
        db.get<{ sql?: string }>(
            `SELECT sql FROM sqlite_master WHERE type='table' AND name='players'`,
            (err, row) => {
                if (err) {
                    console.error('Failed to inspect players table:', err.message);
                    return;
                }
                if (!row?.sql || !row.sql.includes('CHECK(skill BETWEEN 1 AND 5)')) {
                    return;
                }
                db.run('ALTER TABLE players RENAME TO players_old', (renameErr) => {
                    if (renameErr) {
                        console.error(
                            'Failed to rename players table for migration:',
                            renameErr.message
                        );
                        return;
                    }
                    createPlayersTable(false);
                    db.run(
                        `INSERT INTO players (id, user_id, network_id, name, skill)
                         SELECT
                             id,
                             user_id,
                             (
                                 SELECT network_id
                                 FROM users
                                 WHERE users.id = players_old.user_id
                             ) AS network_id,
                             name,
                             MIN(MAX(skill, 0), 10)
                         FROM players_old`,
                        (copyErr) => {
                            if (copyErr) {
                                console.error(
                                    'Failed to copy players data during migration:',
                                    copyErr.message
                                );
                                return;
                            }
                            db.run('DROP TABLE players_old', (dropErr) => {
                                if (dropErr) {
                                    console.error(
                                        'Failed to drop legacy players table:',
                                        dropErr.message
                                    );
                                }
                            });
                        }
                    );
                });
            }
        );
    });
};

db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON');
    db.run(
        `CREATE TABLE IF NOT EXISTS networks (
            id TEXT PRIMARY KEY,
            created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
    );
    db.run(
        `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            avatar TEXT,
            last_active DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            token_version INTEGER NOT NULL DEFAULT 0,
            xp_total INTEGER NOT NULL DEFAULT 0,
            network_id TEXT NOT NULL,
            network_joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            badges_visible_in_search INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(network_id) REFERENCES networks(id) ON DELETE CASCADE
        )`
    );

    createPlayersTable();

    db.run(
        `CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            network_id TEXT NOT NULL,
            teamA TEXT NOT NULL,
            teamB TEXT NOT NULL,
            teamA_score INTEGER NOT NULL DEFAULT 0,
            teamB_score INTEGER NOT NULL DEFAULT 0,
            winner TEXT NOT NULL DEFAULT 'unknown',
            game TEXT,
            map_name TEXT,
            status TEXT NOT NULL DEFAULT 'completed',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(network_id) REFERENCES networks(id) ON DELETE CASCADE
        )`
    );

    db.run(
        `CREATE TABLE IF NOT EXISTS map_preferences (
            network_id TEXT PRIMARY KEY,
            preferences TEXT NOT NULL,
            FOREIGN KEY(network_id) REFERENCES networks(id) ON DELETE CASCADE
        )`
    );

    db.run(
        `CREATE TABLE IF NOT EXISTS xp_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            context TEXT NOT NULL,
            amount INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(user_id, type, context)
        )`
    );

    db.run(
        `CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            type TEXT NOT NULL,
            message TEXT,
            data TEXT,
            is_read INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )`
    );

    db.run(
        `CREATE TABLE IF NOT EXISTS referrals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            referrer_id TEXT NOT NULL,
            referred_id TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(referrer_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(referred_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(referrer_id, referred_id)
        )`
    );

    db.run(
        `CREATE TABLE IF NOT EXISTS friend_requests (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            sender_id TEXT NOT NULL,
            recipient_id TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(sender_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY(recipient_id) REFERENCES users(id) ON DELETE CASCADE,
            UNIQUE(sender_id, recipient_id)
        )`
    );

    const safeAlter = (sql: string) => {
        db.run(sql, (err) => {
            if (err && !err.message.includes('duplicate column name')) {
                console.error(`Failed to run migration "${sql}":`, err.message);
            }
        });
    };

    safeAlter(
        `ALTER TABLE users ADD COLUMN last_active DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
    );
    safeAlter(
        `ALTER TABLE users ADD COLUMN token_version INTEGER NOT NULL DEFAULT 0`
    );
    safeAlter(`ALTER TABLE users ADD COLUMN xp_total INTEGER NOT NULL DEFAULT 0`);
    safeAlter(`ALTER TABLE users ADD COLUMN network_id TEXT`);
    safeAlter(
        `ALTER TABLE users ADD COLUMN network_joined_at DATETIME DEFAULT CURRENT_TIMESTAMP`
    );
    safeAlter(
        `ALTER TABLE users ADD COLUMN badges_visible_in_search INTEGER NOT NULL DEFAULT 0`
    );
    db.run(
        `UPDATE users SET last_active = CURRENT_TIMESTAMP WHERE last_active IS NULL`,
        (err) => {
            if (
                err &&
                !err.message.includes('no such column') &&
                !err.message.includes('no column named last_active')
            ) {
                console.error('Failed to backfill last_active column:', err.message);
            }
        }
    );
    db.run(
        `UPDATE users SET network_joined_at = CURRENT_TIMESTAMP WHERE network_joined_at IS NULL`,
        (err) => {
            if (err && !err.message.includes('no such column')) {
                console.error('Failed to backfill network_joined_at column:', err.message);
            }
        }
    );
    db.run(
        `UPDATE users SET network_id = id WHERE network_id IS NULL OR network_id = ''`,
        (err) => {
            if (
                err &&
                !err.message.includes('no such column') &&
                !err.message.includes('no column named network_id')
            ) {
                console.error('Failed to backfill network_id column:', err.message);
            }
        }
    );

    safeAlter(`ALTER TABLE matches ADD COLUMN teamA_score INTEGER NOT NULL DEFAULT 0`);
    safeAlter(`ALTER TABLE matches ADD COLUMN teamB_score INTEGER NOT NULL DEFAULT 0`);
    safeAlter(`ALTER TABLE matches ADD COLUMN game TEXT`);
    safeAlter(`ALTER TABLE matches ADD COLUMN map_name TEXT`);
    safeAlter(`ALTER TABLE matches ADD COLUMN status TEXT NOT NULL DEFAULT 'completed'`);
    safeAlter(`ALTER TABLE matches ADD COLUMN network_id TEXT`);
    safeAlter(`ALTER TABLE players ADD COLUMN network_id TEXT`);
    migratePlayerSkillConstraint();
    backfillUserNetworks();
    backfillEntityNetwork('players');
    backfillEntityNetwork('matches');
    ensureMapPreferencesNetworkScope();
});

export const runQuery = (sql: string, params: unknown[] = []) => {
    return new Promise<sqlite3.RunResult>((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) {
                return reject(err);
            }
            resolve(this);
        });
    });
};

export const getQuery = <T>(sql: string, params: unknown[] = []) => {
    return new Promise<T | undefined>((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) {
                return reject(err);
            }
            resolve(row as T | undefined);
        });
    });
};

export const allQuery = <T>(sql: string, params: unknown[] = []) => {
    return new Promise<T[]>((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) {
                return reject(err);
            }
            resolve(rows as T[]);
        });
    });
};

export default db;
