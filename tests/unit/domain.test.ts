import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fields, label, type FieldKey } from '../../src/domain/fields';
import {
  draftErrors,
  draftInput,
  newDraft,
  togglePurpose,
} from '../../src/domain/draft';
import {
  isDate,
  isIsoTime,
  parseBackup,
  validateGoal,
  validateRecord,
} from '../../src/data/schema';
import { backup, goal, goalId, record } from '../fixtures';

describe('字段规范与表单语义', () => {
  it('所有中文标签与字段规范逐项一致，没有跨维度标签', () => {
    const spec = readFileSync('01_FIELD_SPEC.md', 'utf8');
    const groups = [...spec.matchAll(/^### (\d+)\.\d+ (.+)$/gm)];
    const sections: [FieldKey, number][] = [
      ['planned_structure', 2],
      ['planned_intensity', 3],
      ['activity_context', 4],
      ['slope_focus', 5],
      ['surface_focus', 6],
      ['additional_purposes', 7],
      ['completion_status', 9],
    ];
    for (const [key, section] of sections) {
      expect(fields[key].options.map((o) => o.label)).toEqual(
        groups.filter((g) => +g[1] === section).map((g) => g[2].trim()),
      );
      for (const o of fields[key].options)
        expect(label(key, o.code)).toBe(o.label);
      expect(label(key, null)).toBe('未填写');
    }
  });
  it('新表单无隐含必填答案，默认本地时间且专项为空', () => {
    const draft = newDraft();
    expect(draft.activity_time).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(draftErrors(draft)).toHaveLength(4);
    expect(() => draftInput(draft)).toThrow();
    expect([
      draft.slope_focus,
      draft.surface_focus,
      draft.additional_purposes,
      draft.rpe,
      draft.note,
    ]).toEqual([null, null, null, null, null]);
    expect(draft.linked_goal_status).toBe('unset');
  });
  it('多选保持三态，取消最后一项不会暗中变成明确无', () => {
    expect(togglePurpose(null, 'gear_test')).toEqual(['gear_test']);
    expect(togglePurpose([], 'gear_test')).toEqual(['gear_test']);
    expect(togglePurpose(['gear_test'], 'race_simulation')).toEqual([
      'gear_test',
      'race_simulation',
    ]);
    expect(togglePurpose(['gear_test'], 'gear_test')).toBeNull();
  });
  it('编辑时未改训练时间保留原秒、毫秒与时区', () => {
    const r = record({ activity_time: '2026-10-06T04:30:27.123Z' });
    expect(draftInput(newDraft(r), r).activity_time).toBe(r.activity_time);
  });
});
describe('记录和备份校验', () => {
  it('有效记录和目标通过校验', () => {
    validateGoal(goal());
    validateRecord(record(), []);
  });
  it.each([0, 11, -1, 1.5, '3', undefined, NaN])('拒绝非法 RPE %s', (rpe) => {
    expect(() => validateRecord({ ...record(), rpe }, [])).toThrow();
  });
  it.each([null, 1, 3, 10])('接受空值与合法 RPE %s', (rpe) => {
    expect(() => validateRecord(record({ rpe }), [])).not.toThrow();
  });
  it.each([
    'planned_structure',
    'planned_intensity',
    'activity_context',
    'completion_status',
  ] as const)('必填 %s 不接受空值或未知 code', (key) => {
    for (const value of [null, '', 'bad'])
      expect(() => validateRecord({ ...record(), [key]: value }, [])).toThrow();
  });
  it.each([
    ['planned_structure', 'planned_structure_other'],
    ['activity_context', 'activity_context_other'],
    ['surface_focus', 'surface_focus_other'],
  ])('%s 其他文字必填', (key, other) => {
    for (const value of [null, '', '  '])
      expect(() =>
        validateRecord({ ...record(), [key]: 'other', [other]: value }, []),
      ).toThrow();
    expect(() =>
      validateRecord({ ...record(), [key]: 'other', [other]: '具体类型' }, []),
    ).not.toThrow();
  });
  it('附加目的其他文字、多选与三态全部校验', () => {
    for (const additional_purposes of [
      null,
      [],
      ['gear_test', 'race_simulation'],
    ] as const) {
      expect(() =>
        validateRecord({ ...record(), additional_purposes }, []),
      ).not.toThrow();
    }
    for (const additional_purposes of [
      'none',
      ['none'],
      ['gear_test', 'gear_test'],
      [3],
      ['other'],
    ])
      expect(() =>
        validateRecord({ ...record(), additional_purposes }, []),
      ).toThrow();
    validateRecord(
      record({
        additional_purposes: ['other'],
        additional_purpose_other: '中文说明',
      }),
      [],
    );
  });
  it('关联目标三态与引用完整性', () => {
    validateRecord(record({ linked_goal_status: 'unset' }), []);
    validateRecord(record({ linked_goal_status: 'none' }), []);
    const linked = record({
      linked_goal_status: 'linked',
      linked_goal_id: goalId,
    });
    validateRecord(linked, [goal({ archived: true })]);
    expect(() => validateRecord(linked, [])).toThrow();
    expect(() =>
      validateRecord({ ...linked, linked_goal_status: 'none' }, [goal()]),
    ).toThrow();
    expect(() =>
      validateRecord({ ...linked, linked_goal_id: null }, [goal()]),
    ).toThrow();
  });
  it.each(['2026-02-30', '2026-13-01', '2026-00-01', '2026-2-1'])(
    '拒绝无效日期 %s',
    (date) => expect(isDate(date)).toBe(false),
  );
  it.each([
    '2026-02-30T10:00:00+08:00',
    '2026-10-06T25:00:00+08:00',
    '2026-10-06T10:00:00',
    '2026-10-06T10:00:00+14:30',
  ])('拒绝无效/不带时区时间 %s', (time) => expect(isIsoTime(time)).toBe(false));
  it('相同时刻不同偏移都合法', () => {
    expect(isIsoTime('2026-10-06T02:00:00Z')).toBe(true);
    expect(isIsoTime('2026-10-06T10:00:00+08:00')).toBe(true);
  });
  it('拒绝损坏、未来版本、缺字段、未知字段、重复ID、悬空目标', () => {
    expect(() => parseBackup('{')).toThrow();
    for (const patch of [
      { format: 'bad' },
      { backup_version: '9.0.0' },
      { records: null },
      { exported_at: 'bad' },
      { surprise: true },
    ])
      expect(() =>
        parseBackup(JSON.stringify({ ...backup(), ...patch })),
      ).toThrow();
    expect(() =>
      parseBackup(
        JSON.stringify(
          backup([record({ schema_version: '9.0.0' as '1.0.0' })]),
        ),
      ),
    ).toThrow();
    expect(() =>
      parseBackup(JSON.stringify(backup([record(), record()]))),
    ).toThrow();
    expect(() =>
      parseBackup(JSON.stringify(backup([], [goal(), goal()]))),
    ).toThrow();
    expect(() =>
      parseBackup(
        JSON.stringify(
          backup([
            record({ linked_goal_status: 'linked', linked_goal_id: goalId }),
          ]),
        ),
      ),
    ).toThrow();
    const r: Partial<ReturnType<typeof record>> = record();
    delete r.note;
    expect(() =>
      parseBackup(JSON.stringify(backup([r as ReturnType<typeof record>]))),
    ).toThrow();
  });
});
