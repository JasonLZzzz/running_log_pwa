import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
} from 'idb';
import {
  SCHEMA_VERSION,
  type Backup,
  type Goal,
  type GoalInput,
  type RecordInput,
  type RunRecord,
} from '../domain/types';
import { nextUpdatedAt } from '../domain/time';
import { validateBackup, validateGoal, validateRecord } from './schema';
import { planMerge } from './merge';
interface LogDb extends DBSchema {
  run_records: {
    key: string;
    value: RunRecord;
    indexes: { activity_time: string; updated_at: string };
  };
  goals: { key: string; value: Goal; indexes: { target_date: string } };
  app_meta: { key: string; value: { key: string; value: string } };
}
export function migrateIndexedDb(
  oldVersion: number,
  newVersion: number | null,
  db: IDBPDatabase<LogDb>,
  tx: IDBPTransaction<
    LogDb,
    ('run_records' | 'goals' | 'app_meta')[],
    'versionchange'
  >,
) {
  if (oldVersion < 1 && newVersion === 1) {
    const records = db.createObjectStore('run_records', {
      keyPath: 'record_id',
    });
    records.createIndex('activity_time', 'activity_time');
    records.createIndex('updated_at', 'updated_at');
    const goals = db.createObjectStore('goals', { keyPath: 'goal_id' });
    goals.createIndex('target_date', 'target_date');
    // Boolean archived cannot be an IndexedDB index key. Filter the small goal list in memory.
    db.createObjectStore('app_meta', { keyPath: 'key' });
    void tx
      .objectStore('app_meta')
      .put({ key: 'schema_version', value: SCHEMA_VERSION });
  }
}
export class Repository {
  private connection?: Promise<IDBPDatabase<LogDb>>;
  constructor(
    private name = 'running_log_db',
    private onBlocked = () => {},
    private onTerminated = () => {},
  ) {}
  private open() {
    this.connection ??= openDB<LogDb>(this.name, 1, {
      upgrade: (db, oldVersion, newVersion, tx) =>
        migrateIndexedDb(oldVersion, newVersion, db, tx),
      blocked: this.onBlocked,
      blocking: () => {
        void this.close();
        this.onTerminated();
      },
      terminated: () => {
        this.connection = undefined;
        this.onTerminated();
      },
    });
    return this.connection;
  }
  async close() {
    const connection = this.connection;
    this.connection = undefined;
    (await connection)?.close();
  }
  async snapshot() {
    const db = await this.open();
    const tx = db.transaction(['run_records', 'goals'], 'readonly');
    const [records, goals] = await Promise.all([
      tx.objectStore('run_records').getAll(),
      tx.objectStore('goals').getAll(),
    ]);
    await tx.done;
    records.sort(
      (a, b) =>
        Date.parse(b.activity_time) - Date.parse(a.activity_time) ||
        b.record_id.localeCompare(a.record_id),
    );
    return { records, goals };
  }
  async saveRecord(input: RecordInput, recordId: string = crypto.randomUUID()) {
    const db = await this.open();
    const tx = db.transaction(['run_records', 'goals'], 'readwrite');
    try {
      const store = tx.objectStore('run_records');
      const existing = await store.get(recordId);
      const goals = await tx.objectStore('goals').getAll();
      const now = nextUpdatedAt(existing?.updated_at);
      const record: RunRecord = {
        ...input,
        record_id: recordId,
        schema_version: SCHEMA_VERSION,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };
      validateRecord(record, goals);
      await store.put(record);
      await tx.done;
      return record;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Already aborted by IndexedDB. */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async saveGoal(input: GoalInput, goalId: string = crypto.randomUUID()) {
    const db = await this.open();
    const tx = db.transaction('goals', 'readwrite');
    try {
      const existing = await tx.store.get(goalId);
      const now = nextUpdatedAt(existing?.updated_at);
      const goal: Goal = {
        ...input,
        goal_id: goalId,
        schema_version: SCHEMA_VERSION,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };
      validateGoal(goal);
      await tx.store.put(goal);
      await tx.done;
      return goal;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Already aborted by IndexedDB. */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }
  async deleteRecord(id: string) {
    const db = await this.open();
    await db.delete('run_records', id);
  }
  async previewImport(backup: Backup) {
    validateBackup(backup);
    return planMerge(await this.snapshot(), backup);
  }
  async importBackup(backup: Backup) {
    validateBackup(backup);
    const db = await this.open();
    const tx = db.transaction(['run_records', 'goals'], 'readwrite');
    try {
      const [records, goals] = await Promise.all([
        tx.objectStore('run_records').getAll(),
        tx.objectStore('goals').getAll(),
      ]);
      // Recompute inside the transaction so another tab cannot invalidate the preview.
      const plan = planMerge({ records, goals }, backup);
      const localGoals = new Map(goals.map((goal) => [goal.goal_id, goal]));
      const localRecords = new Map(
        records.map((record) => [record.record_id, record]),
      );
      // Queue the whole batch before awaiting to avoid one database round trip per record.
      await Promise.all([
        ...plan.goals
          .filter((goal) => localGoals.get(goal.goal_id) !== goal)
          .map((goal) => tx.objectStore('goals').put(goal)),
        ...plan.records
          .filter((record) => localRecords.get(record.record_id) !== record)
          .map((record) => tx.objectStore('run_records').put(record)),
      ]);
      await tx.done;
      return plan;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Already aborted by IndexedDB. */
      }
      await tx.done.catch(() => {});
      throw error;
    }
  }
}
