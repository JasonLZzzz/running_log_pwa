import {
  openDB,
  type DBSchema,
  type IDBPDatabase,
  type IDBPTransaction,
} from 'idb';
import {
  SCHEMA_VERSION,
  type BackupSource,
  type Goal,
  type GoalInput,
  type RecordInput,
  type RunRecord,
  type Shoe,
  type ShoeInput,
} from '../domain/types';
import { nextUpdatedAt } from '../domain/time';
import { normalizeShoeText, sameShoeModel } from '../domain/shoes';
import {
  validateBackup,
  validateGoal,
  validateLegacyGoal,
  validateLegacyRecord,
  validateRecord,
  validateShoe,
  ValidationError,
} from './schema';
import { planMerge } from './merge';

export interface LogDb extends DBSchema {
  run_records: {
    key: string;
    value: RunRecord;
    indexes: { activity_time: string; updated_at: string };
  };
  goals: { key: string; value: Goal; indexes: { target_date: string } };
  shoes: { key: string; value: Shoe };
  app_meta: { key: string; value: { key: string; value: string } };
}
export async function migrateIndexedDb(
  oldVersion: number,
  newVersion: number | null,
  db: IDBPDatabase<LogDb>,
  tx: IDBPTransaction<
    LogDb,
    ('run_records' | 'goals' | 'shoes' | 'app_meta')[],
    'versionchange'
  >,
) {
  if (newVersion !== 2 || oldVersion > 1)
    throw new Error('不支持的数据库升级路径。');
  if (oldVersion < 1) {
    const records = db.createObjectStore('run_records', {
      keyPath: 'record_id',
    });
    records.createIndex('activity_time', 'activity_time');
    records.createIndex('updated_at', 'updated_at');
    const goals = db.createObjectStore('goals', { keyPath: 'goal_id' });
    goals.createIndex('target_date', 'target_date');
    db.createObjectStore('app_meta', { keyPath: 'key' });
  }
  db.createObjectStore('shoes', { keyPath: 'shoe_id' });
  if (oldVersion === 1) {
    // Await only IndexedDB requests to keep the versionchange transaction alive.
    const goals = ((await tx.objectStore('goals').getAll()) as unknown[]).map(
      (goal) => {
        validateLegacyGoal(goal);
        return goal;
      },
    );
    let cursor = await tx.objectStore('run_records').openCursor();
    while (cursor) {
      const record: unknown = cursor.value;
      validateLegacyRecord(record, goals);
      await cursor.update({
        ...record,
        schema_version: SCHEMA_VERSION,
        shoe_id: null,
      });
      cursor = await cursor.continue();
    }
    for (const goal of goals)
      await tx
        .objectStore('goals')
        .put({ ...goal, schema_version: SCHEMA_VERSION });
  }
  await tx
    .objectStore('app_meta')
    .put({ key: 'schema_version', value: SCHEMA_VERSION });
}
export class DatabaseUpgradeError extends Error {}
export class Repository {
  private connection?: Promise<IDBPDatabase<LogDb>>;
  constructor(
    private name = 'running_log_db',
    private onBlocked = () => {},
    private onTerminated = () => {},
  ) {}
  private open() {
    if (!this.connection) {
      let migrationError: unknown;
      this.connection = openDB<LogDb>(this.name, 2, {
        upgrade: (db, oldVersion, newVersion, tx) => {
          void tx.done.catch(() => {});
          void migrateIndexedDb(oldVersion, newVersion, db, tx).catch(
            (error) => {
              migrationError = error;
              void abort(tx);
            },
          );
        },
        blocked: this.onBlocked,
        blocking: () => {
          void this.close();
          this.onTerminated();
        },
        terminated: () => {
          this.connection = undefined;
          this.onTerminated();
        },
      }).catch((error: unknown) => {
        if (migrationError)
          throw new DatabaseUpgradeError(
            '数据库升级失败，升级事务已撤销。请保留原网站数据和升级前 JSON 备份，不要清空数据库；关闭其他窗口后重开，仍失败则等待兼容修复。',
          );
        throw error;
      });
    }
    return this.connection;
  }
  async close() {
    const connection = this.connection;
    this.connection = undefined;
    (await connection)?.close();
  }
  async snapshot() {
    const db = await this.open();
    const tx = db.transaction(['run_records', 'goals', 'shoes'], 'readonly');
    const [records, goals, shoes] = await Promise.all([
      tx.objectStore('run_records').getAll(),
      tx.objectStore('goals').getAll(),
      tx.objectStore('shoes').getAll(),
    ]);
    await tx.done;
    records.sort(
      (a, b) =>
        Date.parse(b.activity_time) - Date.parse(a.activity_time) ||
        b.record_id.localeCompare(a.record_id),
    );
    return { records, goals, shoes };
  }
  async saveRecord(input: RecordInput, recordId: string = crypto.randomUUID()) {
    const db = await this.open();
    const tx = db.transaction(['run_records', 'goals', 'shoes'], 'readwrite');
    try {
      const store = tx.objectStore('run_records');
      const existing = await store.get(recordId);
      const [goals, shoes] = await Promise.all([
        tx.objectStore('goals').getAll(),
        tx.objectStore('shoes').getAll(),
      ]);
      const now = nextUpdatedAt(existing?.updated_at);
      const record: RunRecord = {
        ...input,
        record_id: recordId,
        schema_version: SCHEMA_VERSION,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };
      validateRecord(record, goals, shoes);
      await store.put(record);
      await tx.done;
      return record;
    } catch (error) {
      await abort(tx);
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
      await abort(tx);
      throw error;
    }
  }
  async saveShoe(input: ShoeInput, shoeId: string = crypto.randomUUID()) {
    const db = await this.open();
    const tx = db.transaction('shoes', 'readwrite');
    try {
      const existing = await tx.store.get(shoeId);
      const now = nextUpdatedAt(existing?.updated_at);
      const shoe: Shoe = {
        ...input,
        brand:
          typeof input.brand === 'string' ? input.brand.trim() : input.brand,
        model:
          typeof input.model === 'string' ? input.model.trim() : input.model,
        nickname:
          typeof input.nickname === 'string'
            ? input.nickname.trim()
            : input.nickname,
        shoe_id: shoeId,
        schema_version: SCHEMA_VERSION,
        created_at: existing?.created_at ?? now,
        updated_at: now,
      };
      validateShoe(shoe);
      const identityChanged =
        !existing ||
        !sameShoeModel(existing, shoe) ||
        normalizeShoeText(existing.nickname) !==
          normalizeShoeText(shoe.nickname);
      if (
        identityChanged &&
        (await tx.store.getAll()).some(
          (other) =>
            other.shoe_id !== shoeId &&
            sameShoeModel(other, shoe) &&
            normalizeShoeText(other.nickname) ===
              normalizeShoeText(shoe.nickname),
        )
      )
        throw new ValidationError(
          '同品牌、同鞋款型号已存在该编号/昵称，请换一个昵称（包括已退役鞋）。',
        );
      await tx.store.put(shoe);
      await tx.done;
      return shoe;
    } catch (error) {
      await abort(tx);
      throw error;
    }
  }
  async deleteRecord(id: string) {
    await (await this.open()).delete('run_records', id);
  }
  async previewImport(backup: BackupSource) {
    validateBackup(backup);
    return planMerge(await this.snapshot(), backup);
  }
  async importBackup(backup: BackupSource) {
    validateBackup(backup);
    const db = await this.open();
    const tx = db.transaction(['run_records', 'goals', 'shoes'], 'readwrite');
    try {
      const [records, goals, shoes] = await Promise.all([
        tx.objectStore('run_records').getAll(),
        tx.objectStore('goals').getAll(),
        tx.objectStore('shoes').getAll(),
      ]);
      const plan = planMerge({ records, goals, shoes }, backup);
      const localGoals = new Map(goals.map((goal) => [goal.goal_id, goal]));
      const localRecords = new Map(
        records.map((record) => [record.record_id, record]),
      );
      const localShoes = new Map(shoes.map((shoe) => [shoe.shoe_id, shoe]));
      await Promise.all([
        ...plan.goals
          .filter((goal) => localGoals.get(goal.goal_id) !== goal)
          .map((goal) => tx.objectStore('goals').put(goal)),
        ...plan.records
          .filter((record) => localRecords.get(record.record_id) !== record)
          .map((record) => tx.objectStore('run_records').put(record)),
        ...plan.shoes
          .filter((shoe) => localShoes.get(shoe.shoe_id) !== shoe)
          .map((shoe) => tx.objectStore('shoes').put(shoe)),
      ]);
      await tx.done;
      return plan;
    } catch (error) {
      await abort(tx);
      throw error;
    }
  }
}
async function abort(tx: { abort: () => void; done: Promise<unknown> }) {
  try {
    tx.abort();
  } catch {
    /* IndexedDB may already have aborted. */
  }
  await tx.done.catch(() => {});
}
