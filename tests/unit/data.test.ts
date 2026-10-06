import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { Repository } from '../../src/data/db';
import {
  CSV_HEADERS,
  createBackup,
  csvEscape,
  csvRows,
  exportCsv,
  jsonBackup,
} from '../../src/data/export';
import { parseBackup, validateRecord } from '../../src/data/schema';
import { planMerge } from '../../src/data/merge';
import { localFilenameTime, localIso } from '../../src/domain/time';
import { APP_VERSION, SCHEMA_VERSION } from '../../src/domain/types';
import {
  backup,
  goal,
  goalId,
  record,
  recordId,
  recordInput,
  t0,
  t1,
  t2,
} from '../fixtures';

describe('备份和 CSV', () => {
  it('应用 patch 版本更新，数据与备份版本保持不变', () => {
    expect(APP_VERSION).toBe('2.0.1');
    expect(JSON.parse(readFileSync('package.json', 'utf8')).version).toBe(APP_VERSION);
    expect(SCHEMA_VERSION).toBe('1.0.0');
    expect(createBackup({ records: [], goals: [] }).backup_version).toBe('1.0.0');
  });
  it.each([
    [new Date(2026, 0, 2, 3, 4, 5), '20260102_030405'],
    [new Date(2026, 9, 6, 21, 22, 18), '20261006_212218'],
    [new Date(2026, 11, 31, 23, 59, 59), '20261231_235959'],
  ])('文件时间戳使用本地日历时间并补零：%s', (date, expected) => {
    expect(localFilenameTime(date)).toBe(expected);
    expect(localFilenameTime(date)).toMatch(/^\d{8}_\d{6}$/);
  });
  it('跨秒、跨日读取备份时，JSON 仍保留导出动作捕获的同一时刻', () => {
    const exportedAt = new Date(2026, 11, 31, 23, 59, 59, 999);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2027, 0, 1, 0, 0, 1));
      const data = parseBackup(jsonBackup({ records: [record()], goals: [] }, exportedAt));
      expect(data.exported_at).toBe(localIso(exportedAt));
      expect(localFilenameTime(new Date(data.exported_at))).toBe('20261231_235959');
      expect(data.records[0].schema_version).toBe('1.0.0');
    } finally {
      vi.useRealTimers();
    }
  });
  it('JSON 无损往返空值、空数组、其他文字、多行备注和工程字段', () => {
    const records = [
      record(),
      record({
        record_id: crypto.randomUUID(),
        slope_focus: 'none',
        additional_purposes: [],
      }),
      record({
        record_id: crypto.randomUUID(),
        additional_purposes: ['other', 'gear_test'],
        additional_purpose_other: '测量',
        note: '中文 English, "引号"\n第二行',
        linked_goal_status: 'linked',
        linked_goal_id: goalId,
      }),
    ];
    const data = { records, goals: [goal()] };
    const parsed = parseBackup(jsonBackup(data));
    expect(parsed.records).toEqual(records);
    expect(parsed.goals).toEqual(data.goals);
    expect(parsed.format).toBe('running-log-backup');
    expect(parsed.backup_version).toBe('1.0.0');
  });
  it.each([
    ['plain', 'plain'],
    ['中文,English', '"中文,English"'],
    ['a"b', '"a""b"'],
    ['a\nb', '"a\nb"'],
    ['a\r\nb', '"a\r\nb"'],
  ])('CSV 转义 %s', (value, expected) =>
    expect(csvEscape(value)).toBe(expected),
  );
  it('CSV 中文、BOM、列顺序与三态正确', () => {
    const rows = csvRows({
      records: [
        record(),
        record({
          slope_focus: 'none',
          surface_focus: 'none',
          additional_purposes: [],
          linked_goal_status: 'none',
        }),
        record({
          additional_purposes: [
            'gear_test',
            'fuel_hydration_test',
            'race_simulation',
          ],
          linked_goal_status: 'linked',
          linked_goal_id: goalId,
        }),
      ],
      goals: [goal()],
    });
    expect(rows[0][7]).toBe('');
    expect(rows[0][10]).toBe('');
    expect(rows[0][12]).toBe('未回答');
    expect(rows[1][7]).toBe('无坡向专项');
    expect(rows[1][8]).toBe('无路面专项');
    expect(rows[1][10]).toBe('无附加目的');
    expect(rows[1][12]).toBe('无具体关联目标');
    expect(rows[2][10]).toBe('装备测试；补给/饮水测试；比赛模拟');
    expect(rows[2][12]).toBe('已关联目标');
    expect(rows[2][13]).toBe('测试目标｜2026-10-31');
    const csv = exportCsv({
      records: [record({ note: '中文, "引号"\n第二行' })],
      goals: [],
    });
    expect(csv.startsWith('\uFEFF' + CSV_HEADERS.join(','))).toBe(true);
    expect(csv).toContain('"中文, ""引号""\n第二行"');
    expect(csv).toContain('连续稳定');
  });
});
describe('按时间合并', () => {
  it('new / newer / older / same，目标与记录一起合并；不以ISO字符串字典序判断', () => {
    const local = { records: [record()], goals: [goal()] };
    const cases = [
      [t1, 1, 0],
      [t0, 0, 1],
      ['2026-10-06T01:59:59Z', 0, 1],
      ['2026-10-06T02:00:00Z', 0, 1],
    ] as const;
    for (const [updated_at, updated, skipped] of cases) {
      const plan = planMerge(
        local,
        backup(
          [
            record({
              created_at: '2026-10-05T00:00:00Z',
              updated_at,
              note: 'incoming',
            }),
          ],
          [goal({ updated_at: t1 })],
        ),
      );
      expect(plan.recordCounts).toEqual({
        added: 0,
        updated,
        skipped,
        errors: 0,
      });
      expect(plan.goalCounts.updated).toBe(1);
    }
    expect(
      planMerge({ records: [], goals: [] }, backup([record()], [goal()])).counts
        .added,
    ).toBe(2);
  });
});
describe('IndexedDB CRUD / 事务', () => {
  it('新增、关闭重开、编辑保持ID/创建时间并更新更新时间，删除生效', async () => {
    const name = `test-${crypto.randomUUID()}`;
    let repo = new Repository(name);
    const first = await repo.saveRecord(recordInput(), recordId);
    await repo.close();
    repo = new Repository(name);
    expect((await repo.snapshot()).records).toEqual([first]);
    const edit = await repo.saveRecord(
      recordInput({ rpe: 3, note: '中文\n换行' }),
      recordId,
    );
    expect(edit.record_id).toBe(first.record_id);
    expect(edit.created_at).toBe(first.created_at);
    expect(Date.parse(edit.updated_at)).toBeGreaterThan(
      Date.parse(first.updated_at),
    );
    await repo.deleteRecord(recordId);
    expect((await repo.snapshot()).records).toEqual([]);
    await repo.close();
  });
  it('历史按实际时刻排序，跨时区时间不会错序', async () => {
    const repo = new Repository(`test-${crypto.randomUUID()}`);
    await repo.saveRecord(
      recordInput({ activity_time: '2026-10-06T03:00:00Z' }),
    );
    await repo.saveRecord(
      recordInput({ activity_time: '2026-10-06T10:00:00+08:00' }),
    );
    expect((await repo.snapshot()).records[0].activity_time).toBe(
      '2026-10-06T03:00:00Z',
    );
    await repo.close();
  });
  it('目标编辑和归档保持工程字段与记录引用', async () => {
    const repo = new Repository(`test-${crypto.randomUUID()}`);
    const first = await repo.saveGoal(
      { name: '本地目标', target_date: null, archived: false },
      goalId,
    );
    const linked = await repo.saveRecord(
      recordInput({ linked_goal_status: 'linked', linked_goal_id: goalId }),
    );
    const changed = await repo.saveGoal(
      { name: '修改名称', target_date: '2026-10-31', archived: true },
      goalId,
    );
    expect(changed.created_at).toBe(first.created_at);
    expect(changed.goal_id).toBe(first.goal_id);
    expect(Date.parse(changed.updated_at)).toBeGreaterThan(
      Date.parse(first.updated_at),
    );
    const snapshot = await repo.snapshot();
    expect(snapshot.records[0]).toEqual(linked);
    validateRecord(linked, snapshot.goals);
    await repo.close();
  });
  it('导入预览不写入；重复、新旧冲突在单事务中合并', async () => {
    const repo = new Repository(`test-${crypto.randomUUID()}`);
    const data = backup([record()], [goal()]);
    expect((await repo.previewImport(data)).counts.added).toBe(2);
    expect((await repo.snapshot()).records).toHaveLength(0);
    expect((await repo.importBackup(data)).counts.added).toBe(2);
    expect((await repo.importBackup(data)).counts.skipped).toBe(2);
    const newer = backup(
      [record({ updated_at: t2, note: 'newer' })],
      [goal({ updated_at: t2, archived: true })],
    );
    expect((await repo.importBackup(newer)).counts.updated).toBe(2);
    expect((await repo.importBackup(data)).counts.skipped).toBe(2);
    expect((await repo.snapshot()).records[0].note).toBe('newer');
    await repo.close();
  });
  it('悬空引用和非法编辑不造成部分写入', async () => {
    const repo = new Repository(`test-${crypto.randomUUID()}`);
    await repo.importBackup(backup([record()]));
    const before = await repo.snapshot();
    await expect(
      repo.saveRecord(recordInput({ rpe: 11 }), recordId),
    ).rejects.toThrow();
    await expect(
      repo.importBackup(
        backup(
          [
            record({
              linked_goal_status: 'linked',
              linked_goal_id: crypto.randomUUID(),
              updated_at: t2,
            }),
          ],
          [goal()],
        ),
      ),
    ).rejects.toThrow();
    expect(await repo.snapshot()).toEqual(before);
    await repo.close();
  });
  it('确认导入重新计算合并，另一个连接在预览后写入较新数据仍保留', async () => {
    const name = `test-${crypto.randomUUID()}`;
    const first = new Repository(name);
    const other = new Repository(name);
    await first.importBackup(backup([record()]));
    const incoming = backup([record({ updated_at: t1, note: '备份' })]);
    expect((await first.previewImport(incoming)).counts.updated).toBe(1);
    await other.importBackup(
      backup([record({ updated_at: t2, note: '其他页面' })]),
    );
    expect((await first.importBackup(incoming)).counts.skipped).toBe(1);
    expect((await first.snapshot()).records[0].note).toBe('其他页面');
    await first.close();
    await other.close();
  });
  it('数据层本身拒绝未来版本和非法目标，不依赖UI校验', async () => {
    const repo = new Repository(`test-${crypto.randomUUID()}`);
    await expect(
      repo.importBackup({
        ...backup(),
        backup_version: '9.0.0',
      } as unknown as ReturnType<typeof backup>),
    ).rejects.toThrow();
    await expect(
      repo.importBackup(backup([], [goal({ name: '' })])),
    ).rejects.toThrow();
    expect((await repo.snapshot()).goals).toEqual([]);
    await repo.close();
  });
  it('1000 条备份可以合并和读取', async () => {
    const repo = new Repository(`test-${crypto.randomUUID()}`);
    const records = Array.from({ length: 1000 }, (_, i) =>
      record({
        record_id: crypto.randomUUID(),
        activity_time: new Date(Date.parse(t0) + i * 60000).toISOString(),
      }),
    );
    expect(
      (await repo.importBackup(createBackup({ records, goals: [] }))).counts
        .added,
    ).toBe(1000);
    const snapshot = await repo.snapshot();
    expect(snapshot.records).toHaveLength(1000);
    expect(snapshot.records[0].record_id).toBe(records[999].record_id);
    await repo.close();
  });
});
