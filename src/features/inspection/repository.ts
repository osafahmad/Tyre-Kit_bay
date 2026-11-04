import { open, type DB } from '@op-engineering/op-sqlite';
import type { Inspection } from './types';

/**
 * Local inspection storage. Nothing here leaves the phone. Plate and chassis
 * numbers are personal data: don't log rows.
 */
export interface InspectionRepository {
  loadAll(): Promise<Inspection[]>;
  save(inspection: Inspection): Promise<void>;
  remove(id: string): Promise<void>;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS inspections (
     id TEXT PRIMARY KEY NOT NULL,
     created_at TEXT NOT NULL,
     completed_at TEXT,
     data TEXT NOT NULL
   )`,
  'CREATE INDEX IF NOT EXISTS inspections_created_at ON inspections (created_at)',
];

/** One row per inspection; tyres are stored with it as JSON. */
export class SqliteInspectionRepository implements InspectionRepository {
  private db: DB | null = null;
  private ready: Promise<DB> | null = null;

  private connect(): Promise<DB> {
    this.ready ??= (async () => {
      const db = open({ name: 'inspections.sqlite' });
      for (const statement of SCHEMA) {
        await db.execute(statement);
      }
      this.db = db;
      return db;
    })();
    return this.ready;
  }

  async loadAll(): Promise<Inspection[]> {
    const db = await this.connect();
    const { rows } = await db.execute('SELECT data FROM inspections ORDER BY created_at DESC');
    const inspections: Inspection[] = [];
    for (const row of rows) {
      try {
        inspections.push(JSON.parse(String(row.data)) as Inspection);
      } catch {
        // Skip a corrupt row rather than failing the whole app.
      }
    }
    return inspections;
  }

  async save(inspection: Inspection): Promise<void> {
    const db = await this.connect();
    await db.execute(
      `INSERT INTO inspections (id, created_at, completed_at, data) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET completed_at = excluded.completed_at, data = excluded.data`,
      [inspection.id, inspection.createdAt, inspection.completedAt, JSON.stringify(inspection)],
    );
  }

  async remove(id: string): Promise<void> {
    const db = await this.connect();
    await db.execute('DELETE FROM inspections WHERE id = ?', [id]);
  }
}

/** Used by tests. */
export class MemoryInspectionRepository implements InspectionRepository {
  readonly rows = new Map<string, string>();

  async loadAll(): Promise<Inspection[]> {
    return [...this.rows.values()]
      .map(r => JSON.parse(r) as Inspection)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async save(inspection: Inspection): Promise<void> {
    this.rows.set(inspection.id, JSON.stringify(inspection));
  }

  async remove(id: string): Promise<void> {
    this.rows.delete(id);
  }
}
