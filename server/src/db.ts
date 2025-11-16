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

const PLAYERS_TABLE_DEFINITION = `(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        name TEXT NOT NULL,
        skill INTEGER NOT NULL CHECK(skill BETWEEN 0 AND 10),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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
                                `INSERT INTO players (id, user_id, name, skill)
                                 SELECT id, user_id, name, MIN(MAX(skill, 0), 10) FROM players_old`,
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
                        `INSERT INTO players (id, user_id, name, skill)
                         SELECT id, user_id, name, MIN(MAX(skill, 0), 10) FROM players_old`,
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
        `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            avatar TEXT,
            last_active DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            token_version INTEGER NOT NULL DEFAULT 0
        )`
    );

    createPlayersTable();

    db.run(
        `CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            teamA TEXT NOT NULL,
            teamB TEXT NOT NULL,
            teamA_score INTEGER NOT NULL DEFAULT 0,
            teamB_score INTEGER NOT NULL DEFAULT 0,
            winner TEXT NOT NULL DEFAULT 'unknown',
            game TEXT,
            map_name TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )`
    );

    db.run(
        `CREATE TABLE IF NOT EXISTS map_preferences (
            user_id TEXT PRIMARY KEY,
            preferences TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
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

    safeAlter(`ALTER TABLE matches ADD COLUMN teamA_score INTEGER NOT NULL DEFAULT 0`);
    safeAlter(`ALTER TABLE matches ADD COLUMN teamB_score INTEGER NOT NULL DEFAULT 0`);
    safeAlter(`ALTER TABLE matches ADD COLUMN game TEXT`);
    safeAlter(`ALTER TABLE matches ADD COLUMN map_name TEXT`);
    migratePlayerSkillConstraint();
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
