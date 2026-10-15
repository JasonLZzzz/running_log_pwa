import { expect, it, vi } from 'vitest';
import { openDB } from 'idb';
import { Repository, DatabaseUpgradeError } from '../../src/data/db';
import { createBackup, csvRows, CSV_HEADERS } from '../../src/data/export';
import {
  migrateBackup,
  parseBackup,
  validateShoe,
} from '../../src/data/schema';
import { suggestedNickname } from '../../src/domain/shoes';
import {
  backup,
  legacyBackup,
  record,
  recordInput,
  goal,
  goalId,
  shoe,
  shoeId,
  shoeInput,
  t0,
  t1,
  t2,
} from '../fixtures';

const name = () => `test-shoes-${crypto.randomUUID()}`;
async function oldDatabase(dbName: string, corrupt = false) {
  const data = legacyBackup(
    [
      record({
        linked_goal_status: 'linked',
        linked_goal_id: goalId,
        note: '合成备注\n不更改',
        rpe: 7,
      }),
      record({
        record_id: '44444444-4444-4444-8444-444444444444',
        additional_purposes: [],
        slope_focus: 'none',
      }),
    ],
    [goal({ archived: true })],
  );
  const db = await openDB(dbName, 1, {
    upgrade(db) {
      const records = db.createObjectStore('run_records', {
        keyPath: 'record_id',
      });
      records.createIndex('activity_time', 'activity_time');
      records.createIndex('updated_at', 'updated_at');
      db.createObjectStore('goals', { keyPath: 'goal_id' }).createIndex(
        'target_date',
        'target_date',
      );
      db.createObjectStore('app_meta', { keyPath: 'key' });
    },
  });
  await db.put('app_meta', { key: 'schema_version', value: '1.0.0' });
  await db.put('app_meta', { key: 'unrelated', value: '保留' });
  for (const record of data.records) await db.put('run_records', record);
  for (const goal of data.goals) await db.put('goals', goal);
  if (corrupt) await db.put('run_records', { ...data.records[1], rpe: 11 });
  return { db, data };
}

it('空库 0→2 创建全部 store、索引和元信息', async () => {
  const dbName = name();
  const repo = new Repository(dbName);
  expect(await repo.snapshot()).toEqual({ records: [], goals: [], shoes: [] });
  const db = await openDB(dbName);
  expect(db.version).toBe(2);
  expect([...db.objectStoreNames]).toEqual([
    'app_meta',
    'goals',
    'run_records',
    'shoes',
  ]);
  expect(await db.get('app_meta', 'schema_version')).toEqual({
    key: 'schema_version',
    value: '2.0.0',
  });
  expect([...db.transaction('run_records').store.indexNames]).toEqual([
    'activity_time',
    'updated_at',
  ]);
  db.close();
  await repo.close();
});

it('1→2 原子迁移保留全部旧字段和时间，目标仅技术版本升级', async () => {
  const dbName = name();
  const { db, data } = await oldDatabase(dbName);
  db.close();
  const repo = new Repository(dbName);
  const result = await repo.snapshot();
  expect(result.shoes).toEqual([]);
  for (const old of data.records)
    expect(result.records.find((r) => r.record_id === old.record_id)).toEqual({
      ...old,
      schema_version: '2.0.0',
      shoe_id: null,
    });
  expect(result.goals).toEqual(
    data.goals.map((g) => ({ ...g, schema_version: '2.0.0' })),
  );
  const upgraded = await openDB(dbName);
  expect((await upgraded.get('app_meta', 'unrelated')).value).toBe('保留');
  await expect(openDB(dbName, 1)).rejects.toMatchObject({
    name: 'VersionError',
  });
  upgraded.close();
  await repo.close();
});

it('迁移已更新首条后遇到错误，事务回滚版本/store/已写数据，绝不部分升级', async () => {
  const dbName = name();
  const { db } = await oldDatabase(dbName, true);
  const beforeRecords = await db.getAll('run_records');
  const beforeGoals = await db.getAll('goals');
  db.close();
  const updates = vi.spyOn(IDBCursor.prototype, 'update');
  try {
    const repo = new Repository(dbName);
    await expect(repo.snapshot()).rejects.toBeInstanceOf(DatabaseUpgradeError);
    expect(updates).toHaveBeenCalled();
    const original = await openDB(dbName, 1);
    expect(original.version).toBe(1);
    expect([...original.objectStoreNames]).toEqual([
      'app_meta',
      'goals',
      'run_records',
    ]);
    expect(await original.getAll('run_records')).toEqual(beforeRecords);
    expect(await original.getAll('goals')).toEqual(beforeGoals);
    expect((await original.get('app_meta', 'schema_version')).value).toBe(
      '1.0.0',
    );
    original.close();
  } finally {
    updates.mockRestore();
  }
});

it('旧连接阻塞升级会通知；新连接 blocking 会关闭并通知旧页面', async () => {
  const dbName = name();
  const { db } = await oldDatabase(dbName);
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  const repo = new Repository(dbName, release);
  const opening = repo.snapshot();
  await blocked;
  db.close();
  await opening;
  await repo.close();
  const terminated = vi.fn();
  const current = new Repository(dbName, undefined, terminated);
  await current.snapshot();
  const next = await openDB(dbName, 3);
  expect(terminated).toHaveBeenCalledOnce();
  next.close();
});

it('鞋库同型号多实体、默认编号、编辑/退役/恢复时间和记录引用保持', async () => {
  const repo = new Repository(name());
  const first = await repo.saveShoe(
    shoeInput({ brand: ' 示例品牌 ', nickname: '1号' }),
  );
  const second = await repo.saveShoe(shoeInput({ nickname: '2号' }));
  expect(first.shoe_id).not.toBe(second.shoe_id);
  expect(first.brand).toBe('示例品牌');
  const run = await repo.saveRecord(recordInput({ shoe_id: first.shoe_id }));
  const retired = await repo.saveShoe(
    { ...shoeInput(), model: '改名型号', status: 'retired' },
    first.shoe_id,
  );
  expect(retired.shoe_id).toBe(first.shoe_id);
  expect(retired.created_at).toBe(first.created_at);
  expect(Date.parse(retired.updated_at)).toBeGreaterThan(
    Date.parse(first.updated_at),
  );
  expect((await repo.snapshot()).records).toEqual([run]);
  await repo.saveRecord(
    recordInput({ shoe_id: retired.shoe_id }),
    run.record_id,
  );
  const restored = await repo.saveShoe(
    { ...shoeInput(), nickname: '3号', status: 'active' },
    first.shoe_id,
  );
  expect(restored.created_at).toBe(first.created_at);
  expect(
    suggestedNickname(
      [shoe({ status: 'retired' }), shoe({ nickname: '3号' })],
      '示例品牌',
      '合成训练鞋',
    ),
  ).toBe('4号');
  await repo.close();
});

it('必填/枚举/UUID/时间/鞋款内昵称冲突拒绝，退役昵称也不重用', async () => {
  const repo = new Repository(name());
  await repo.saveShoe(shoeInput({ brand: 'TEST', status: 'retired' }));
  await expect(
    repo.saveShoe(shoeInput({ brand: ' test ', nickname: ' 1号 ' })),
  ).rejects.toThrow('昵称');
  await repo.saveShoe(shoeInput({ brand: 'TEST', model: '不同型号' }));
  await repo.saveShoe(shoeInput({ brand: '不同品牌' }));
  for (const patch of [
    { brand: '' },
    { model: ' ' },
    { nickname: '' },
    { shoe_type: 'bad' },
    { status: 'deleted' },
    { shoe_id: 'bad' },
    { updated_at: 'bad' },
    { surprise: 1 },
  ])
    expect(() => validateShoe({ ...shoe(), ...patch })).toThrow();
  await expect(
    repo.saveRecord(recordInput({ shoe_id: crypto.randomUUID() })),
  ).rejects.toThrow('用鞋');
  expect((await repo.snapshot()).records).toEqual([]);
  await repo.close();
});

it('v1 严格校验后转 v2 保留所有旧数据，不接受混合字段/版本', () => {
  const old = legacyBackup([record({ note: '合成旧备注' })], [goal()]);
  const parsed = parseBackup(JSON.stringify(old));
  expect(parsed.backup_version).toBe('1.0.0');
  const upgraded = migrateBackup(parsed.backup_version, parsed);
  expect(upgraded).toEqual(backup([record({ note: '合成旧备注' })], [goal()]));
  for (const patch of [
    { shoes: [] },
    { backup_version: '3.0.0' },
    { records: [{ ...old.records[0], shoe_id: null }] },
    { goals: [{ ...old.goals[0], schema_version: '2.0.0' }] },
    { records: [{ ...old.records[0], unknown: true }] },
  ])
    expect(() => parseBackup(JSON.stringify({ ...old, ...patch }))).toThrow();
});

it('较新的 v1 更新其他字段但保留本地鞋；相同/更旧跳过；v2 null 可主动清除', async () => {
  const repo = new Repository(name());
  await repo.importBackup(backup([record({ shoe_id: shoeId })], [], [shoe()]));
  const old = legacyBackup([
    record({ updated_at: t1, note: '旧备份较新备注' }),
  ]);
  const preview = await repo.previewImport(old);
  expect(preview.protectedShoeLinks).toBe(1);
  expect((await repo.snapshot()).records[0].note).toBeNull();
  await repo.importBackup(old);
  expect((await repo.snapshot()).records[0]).toEqual(
    record({ shoe_id: shoeId, updated_at: t1, note: '旧备份较新备注' }),
  );
  expect((await repo.importBackup(old)).recordCounts.skipped).toBe(1);
  expect((await repo.importBackup(legacyBackup())).recordCounts.skipped).toBe(
    1,
  );
  await repo.importBackup(backup([record({ updated_at: t2, shoe_id: null })]));
  expect((await repo.snapshot()).records[0].shoe_id).toBeNull();
  await repo.close();
});

it('v2 备份在空库完整恢复，导入同名不同 ID 保留实体，允许后续编辑状态', async () => {
  const source = new Repository(name());
  const other = shoe({ shoe_id: crypto.randomUUID(), status: 'retired' });
  await source.importBackup(
    backup([record({ shoe_id: other.shoe_id })], [goal()], [shoe(), other]),
  );
  const data = createBackup(await source.snapshot());
  const target = new Repository(name());
  const plan = await target.importBackup(data);
  expect(plan.shoeCounts.added).toBe(2);
  expect((await target.snapshot()).shoes).toHaveLength(2);
  expect(await target.snapshot()).toEqual(await source.snapshot());
  expect((await target.importBackup(data)).counts.skipped).toBe(4);
  await target.saveShoe({ ...shoeInput(), status: 'retired' }, shoeId);
  expect((await target.snapshot()).records[0].shoe_id).toBe(other.shoe_id);
  await source.close();
  await target.close();
});

it('缺失鞋、重复 ID、非法鞋、字段缺失整批拒绝，不部分写入', async () => {
  const repo = new Repository(name());
  await repo.importBackup(backup([record()]));
  const before = await repo.snapshot();
  for (const data of [
    backup([record({ shoe_id: shoeId, updated_at: t1 })]),
    backup([], [], [shoe(), shoe()]),
    { ...backup(), shoes: [{ ...shoe(), shoe_type: 'unknown' }] },
    { ...backup(), shoes: undefined },
    { ...backup(), backup_version: '8.0.0' },
  ]) {
    await expect(
      repo.importBackup(data as ReturnType<typeof backup>),
    ).rejects.toThrow();
    expect(await repo.snapshot()).toEqual(before);
  }
  await repo.close();
});

it('预览后另一个连接更新鞋/记录，实际事务重算保护与统计', async () => {
  const dbName = name();
  const repo = new Repository(dbName);
  const other = new Repository(dbName);
  await repo.importBackup(backup([record()], [], [shoe()]));
  const old = legacyBackup([
    record({ updated_at: t2, note: '来自合成旧备份' }),
  ]);
  expect((await repo.previewImport(old)).protectedShoeLinks).toBe(0);
  await other.importBackup(
    backup(
      [record({ updated_at: t1, shoe_id: shoeId })],
      [],
      [shoe({ updated_at: t1, nickname: '新昵称' })],
    ),
  );
  const plan = await repo.importBackup(old);
  expect(plan.protectedShoeLinks).toBe(1);
  expect(plan.records[0].shoe_id).toBe(shoeId);
  const older = backup([], [], [shoe({ updated_at: t0 })]);
  expect((await repo.importBackup(older)).shoeCounts.skipped).toBe(1);
  expect((await repo.snapshot()).shoes[0].nickname).toBe('新昵称');
  await repo.close();
  await other.close();
});

it('CSV 只追加五列，空鞋空值、中文类型和动态名称正确', () => {
  expect(CSV_HEADERS.slice(0, 20)).toEqual([
    '记录ID',
    '训练时间',
    '计划结构',
    '计划结构-其他说明',
    '计划主要强度',
    '活动情境',
    '活动情境-其他说明',
    '坡向专项',
    '路面专项',
    '路面专项-其他说明',
    '附加目的',
    '附加目的-其他说明',
    '关联目标状态',
    '关联目标',
    '完成情况',
    'RPE',
    '备注',
    '创建时间',
    '更新时间',
    '数据结构版本',
  ]);
  expect(CSV_HEADERS.slice(-5)).toEqual([
    '用鞋ID',
    '用鞋品牌',
    '用鞋型号',
    '用鞋昵称',
    '用鞋类型',
  ]);
  const rows = csvRows({
    records: [record(), record({ shoe_id: shoeId })],
    goals: [],
    shoes: [shoe({ shoe_type: 'trail', model: '改名型号', status: 'retired' })],
  });
  expect(rows[0].slice(20)).toEqual(['', '', '', '', '']);
  expect(rows[1].slice(20)).toEqual([
    shoeId,
    '示例品牌',
    '改名型号',
    '1号',
    '越野鞋',
  ]);
});

it('JSON 导出也拒绝缺失鞋引用，不能生成不可恢复的备份', () => {
  expect(() =>
    createBackup({
      records: [record({ shoe_id: shoeId })],
      goals: [],
      shoes: [],
    }),
  ).toThrow('用鞋');
});

it('导入写入后发生事务失败，记录/目标/鞋库整批回滚', async () => {
  const repo = new Repository(name());
  await repo.importBackup(backup([record()], [goal()]));
  const before = await repo.snapshot();
  const originalPut = IDBObjectStore.prototype.put;
  const writes = vi
    .spyOn(IDBObjectStore.prototype, 'put')
    .mockImplementation(function (
      this: IDBObjectStore,
      ...args: Parameters<IDBObjectStore['put']>
    ) {
      const request = originalPut.apply(this, args);
      if (this.name === 'shoes')
        request.addEventListener('success', () => this.transaction.abort(), {
          once: true,
        });
      return request;
    });
  try {
    await expect(
      repo.importBackup(
        backup(
          [record({ updated_at: t2, shoe_id: shoeId, note: '不应部分保存' })],
          [goal({ updated_at: t2, name: '不应部分改名' })],
          [shoe()],
        ),
      ),
    ).rejects.toThrow();
    expect(await repo.snapshot()).toEqual(before);
  } finally {
    writes.mockRestore();
    await repo.close();
  }
});

it('两个连接同时创建同鞋款同昵称，事务内冲突校验只允许一双', async () => {
  const dbName = name();
  const a = new Repository(dbName);
  const b = new Repository(dbName);
  const results = await Promise.allSettled([
    a.saveShoe(shoeInput()),
    b.saveShoe(shoeInput()),
  ]);
  expect(
    results.filter((result) => result.status === 'fulfilled'),
  ).toHaveLength(1);
  expect((await a.snapshot()).shoes).toHaveLength(1);
  await a.close();
  await b.close();
});
