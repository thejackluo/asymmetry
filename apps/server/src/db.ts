import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import BetterSqlite3 from 'better-sqlite3';

export type Database = BetterSqlite3.Database;

export function resolveDatabasePath(value: string | undefined = process.env.DATABASE_PATH): string {
  return value || fileURLToPath(new URL('../../../asymmetry.db', import.meta.url));
}

const schemaPath = (): string => {
  const candidates = [
    new URL('./schema.sql', import.meta.url),
    new URL('../src/schema.sql', import.meta.url),
  ];
  for (const candidate of candidates) {
    const path = fileURLToPath(candidate);
    if (existsSync(path)) return path;
  }
  throw new Error('schema.sql not found next to db module or in src/');
};

export function openDatabase(path: string = resolveDatabasePath()): Database {
  const db = new BetterSqlite3(path);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(readFileSync(schemaPath(), 'utf8'));
    return db;
  } catch (err) {
    db.close();
    throw err;
  }
}

export function get<T>(db: Database, sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function all<T>(db: Database, sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

export function run(
  db: Database,
  sql: string,
  ...params: unknown[]
): BetterSqlite3.RunResult {
  return db.prepare(sql).run(...params);
}
