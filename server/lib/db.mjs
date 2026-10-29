// SQLite through Node's built-in node:sqlite (Node >= 22.13, zero packages). One file: <DATA_DIR>/app.db.
// Core tables: users (wallets that signed in), sessions (hashed bearer tokens), kv (small settings).
// A route module adds its own tables with db.migrate('<name>', [sql, sql, ...]): each step runs once, in order.
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const CORE = [
  `CREATE TABLE IF NOT EXISTS users (
     address TEXT PRIMARY KEY,
     first_seen INTEGER NOT NULL,
     last_seen INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS sessions (
     hash TEXT PRIMARY KEY,
     address TEXT NOT NULL,
     created INTEGER NOT NULL,
     exp INTEGER NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS sessions_exp ON sessions(exp)',
  'CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)',
  'CREATE TABLE IF NOT EXISTS migrations (name TEXT NOT NULL, step INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (name, step))',
];

export function openDb(dataDir, file = 'app.db') {
  mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(file === ':memory:' ? ':memory:' : join(dataDir, file));
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
  for (const sql of CORE) db.exec(sql);

  const cache = new Map();
  const prepare = (sql) => {
    let st = cache.get(sql);
    if (!st) {
      st = db.prepare(sql);
      cache.set(sql, st);
    }
    return st;
  };

  function tx(fn) {
    db.exec('BEGIN');
    try {
      const out = fn();
      db.exec('COMMIT');
      return out;
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }

  /** Runs each step of `name` once (append new steps; never edit old ones). */
  function migrate(name, steps) {
    const done = new Set(prepare('SELECT step FROM migrations WHERE name = ?').all(name).map((r) => r.step));
    steps.forEach((sql, i) => {
      if (done.has(i)) return;
      tx(() => {
        db.exec(sql);
        prepare('INSERT INTO migrations (name, step, at) VALUES (?, ?, ?)').run(name, i, Date.now());
      });
    });
  }

  return {
    raw: db,
    run: (sql, ...a) => prepare(sql).run(...a),
    get: (sql, ...a) => prepare(sql).get(...a),
    all: (sql, ...a) => prepare(sql).all(...a),
    exec: (sql) => db.exec(sql),
    tx,
    migrate,
    kvGet(k) {
      const r = prepare('SELECT v FROM kv WHERE k = ?').get(k);
      return r ? JSON.parse(r.v) : undefined;
    },
    kvSet(k, v) {
      prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').run(k, JSON.stringify(v));
    },
    ok() {
      try {
        return prepare('SELECT 1 AS one').get().one === 1;
      } catch {
        return false;
      }
    },
    close: () => db.close(),
  };
}
