import { expect, it } from 'vitest';
import { goal, goalId, record } from '../fixtures';
import { validateRecord } from '../../src/data/schema';
import { csvRows, jsonBackup } from '../../src/data/export';
import { parseBackup } from '../../src/data/schema';
import type { RunRecord } from '../../src/domain/types';
const scenarios: [string, Partial<RunRecord>][] = [
  [
    '普通轻松跑',
    {
      slope_focus: 'none',
      surface_focus: 'none',
      additional_purposes: [],
      rpe: 3,
    },
  ],
  ['连续阈值', { planned_intensity: 'threshold', rpe: 7 }],
  [
    '阈值间歇',
    {
      planned_structure: 'repeat_interval',
      planned_intensity: 'threshold',
      note: '4×8 分钟',
    },
  ],
  [
    '8 次反复上下山',
    {
      planned_structure: 'repeat_interval',
      planned_intensity: 'moderate',
      slope_focus: 'uphill_downhill',
      surface_focus: 'none',
      linked_goal_status: 'linked',
      linked_goal_id: goalId,
    },
  ],
  [
    '越野自由跑',
    {
      planned_structure: 'unstructured',
      planned_intensity: 'unspecified',
      activity_context: 'leisure',
      surface_focus: 'technical_trail',
    },
  ],
  [
    '比赛',
    { activity_context: 'race', completion_status: 'adjusted_completed' },
  ],
  ['陪跑', { activity_context: 'social' }],
  ['跑走策略', { planned_structure: 'run_walk' }],
  [
    '多重附加目的',
    {
      additional_purposes: [
        'gear_test',
        'fuel_hydration_test',
        'race_simulation',
      ],
    },
  ],
  ['未回答与明确无', { slope_focus: null }],
];
it.each(scenarios)('验收场景：%s，校验与JSON/CSV保持各维度', (_name, patch) => {
  const r = record(patch);
  const goals = [goal({ name: '黄山百公里40 km组' })];
  validateRecord(r, goals);
  const snapshot = { records: [r], goals };
  expect(parseBackup(jsonBackup(snapshot)).records[0]).toEqual(r);
  const row = csvRows(snapshot)[0];
  expect(row).toHaveLength(20);
  if (
    r.planned_intensity === 'threshold' &&
    r.planned_structure === 'continuous_steady'
  )
    expect(row[2]).toBe('连续稳定');
  if (r.slope_focus === null) expect(row[7]).toBe('');
  if (r.additional_purposes?.length === 3)
    expect(row[10]).toBe('装备测试；补给/饮水测试；比赛模拟');
});
