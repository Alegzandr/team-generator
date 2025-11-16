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

db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON');
    db.run(
        `CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL,
            avatar TEXT,
            last_active DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )`
    );

    db.run(
        `CREATE TABLE IF NOT EXISTS players (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            name TEXT NOT NULL,
            skill INTEGER NOT NULL CHECK(skill BETWEEN 1 AND 5),
            FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
        )`
    );

    db.run(
        `CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            teamA TEXT NOT NULL,
            teamB TEXT NOT NULL,
            teamA_score INTEGER NOT NULL DEFAULT 0,
            teamB_score INTEGER NOT NULL DEFAULT 0,
            winner TEXT NOT NULL DEFAULT 'unknown',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
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
