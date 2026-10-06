import { fields, type FieldKey } from '../domain/fields';
import {
  SCHEMA_VERSION,
  type Backup,
  type Goal,
  type RunRecord,
} from '../domain/types';

export class ValidationError extends Error {}
function fail(message: string): never {
  throw new ValidationError(message);
}
function object(value: unknown, title: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    fail(`${title}格式不正确。`);
  return value as Record<string, unknown>;
}
function keys(
  value: Record<string, unknown>,
  allowed: string[],
  title: string,
) {
  if (
    Object.keys(value).length !== allowed.length ||
    allowed.some((key) => !(key in value)) ||
    Object.keys(value).some((key) => !allowed.includes(key))
  ) {
    fail(`${title}字段缺失或包含当前版本无法识别的字段。`);
  }
}
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function uuid(value: unknown, name: string) {
  if (typeof value !== 'string' || !uuidPattern.test(value))
    fail(`${name}必须是有效的 UUID v4。`);
}
export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T00:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
export function isIsoTime(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match =
    /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  return (
    !!match &&
    isDate(match[1]) &&
    +match[2] < 24 &&
    +match[3] < 60 &&
    +match[4] < 60 &&
    (match[5] === 'Z' ||
      (+match[6] <= 14 &&
        +match[7] < 60 &&
        (+match[6] < 14 || +match[7] === 0))) &&
    Number.isFinite(Date.parse(value))
  );
}
function textOrNull(value: unknown, name: string) {
  if (value !== null && typeof value !== 'string')
    fail(`${name}必须是文字或空值。`);
}
function enumValue(value: unknown, key: FieldKey, optional = false) {
  if (optional && value === null) return;
  if (!fields[key].options.some((o) => o.code === value))
    fail(`请填写有效的${fields[key].label}。`);
}
function common(value: Record<string, unknown>, id: string, name: string) {
  uuid(value[id], `${name}ID`);
  if (value.schema_version !== SCHEMA_VERSION)
    fail(`${name}数据结构版本无法识别。`);
  for (const key of ['created_at', 'updated_at'])
    if (!isIsoTime(value[key]))
      fail(`${name}创建时间或更新时间必须是带时区的有效日期时间。`);
  if (
    Date.parse(value.updated_at as string) <
    Date.parse(value.created_at as string)
  )
    fail(`${name}更新时间不能早于创建时间。`);
}
const recordKeys = [
  'record_id',
  'schema_version',
  'activity_time',
  'created_at',
  'updated_at',
  'planned_structure',
  'planned_structure_other',
  'planned_intensity',
  'activity_context',
  'activity_context_other',
  'slope_focus',
  'surface_focus',
  'surface_focus_other',
  'additional_purposes',
  'additional_purpose_other',
  'linked_goal_status',
  'linked_goal_id',
  'completion_status',
  'rpe',
  'note',
];
const goalKeys = [
  'goal_id',
  'schema_version',
  'name',
  'target_date',
  'archived',
  'created_at',
  'updated_at',
];
export function validateGoal(input: unknown): asserts input is Goal {
  const goal = object(input, '目标');
  keys(goal, goalKeys, '目标');
  common(goal, 'goal_id', '目标');
  if (typeof goal.name !== 'string' || !goal.name.trim())
    fail('请输入目标名称。');
  if (goal.target_date !== null && !isDate(goal.target_date))
    fail('目标日期必须是有效的日期。');
  if (typeof goal.archived !== 'boolean') fail('目标归档状态不正确。');
}
export function validateRecord(
  input: unknown,
  goals: readonly Goal[],
): asserts input is RunRecord {
  const record = object(input, '记录');
  keys(record, recordKeys, '记录');
  common(record, 'record_id', '记录');
  if (!isIsoTime(record.activity_time))
    fail('训练时间必须是带时区的有效日期时间。');
  for (const key of [
    'planned_structure',
    'planned_intensity',
    'activity_context',
    'completion_status',
  ] as const)
    enumValue(record[key], key);
  for (const key of ['slope_focus', 'surface_focus'] as const)
    enumValue(record[key], key, true);
  const otherPairs = [
    ['planned_structure', 'planned_structure_other', '计划结构'],
    ['activity_context', 'activity_context_other', '活动情境'],
    ['surface_focus', 'surface_focus_other', '路面专项'],
  ];
  for (const [key, other, name] of otherPairs) {
    textOrNull(record[other], `${name}其他说明`);
    if (
      record[key] === 'other' &&
      (typeof record[other] !== 'string' || !(record[other] as string).trim())
    )
      fail(`${name}选择“其他”时，请补充具体类型。`);
  }
  const purposes = record.additional_purposes;
  if (purposes !== null) {
    if (!Array.isArray(purposes)) fail('附加目的必须是空值或多选数组。');
    if (new Set(purposes).size !== purposes.length) fail('附加目的不能重复。');
    for (const purpose of purposes) enumValue(purpose, 'additional_purposes');
  }
  textOrNull(record.additional_purpose_other, '附加目的其他说明');
  if (
    Array.isArray(purposes) &&
    purposes.includes('other') &&
    (typeof record.additional_purpose_other !== 'string' ||
      !record.additional_purpose_other.trim())
  )
    fail('附加目的选择“其他”时，请补充具体类型。');
  if (
    !['unset', 'none', 'linked'].includes(record.linked_goal_status as string)
  )
    fail('关联目标状态不正确。');
  if (record.linked_goal_status === 'linked') {
    uuid(record.linked_goal_id, '关联目标ID');
    if (!goals.some((goal) => goal.goal_id === record.linked_goal_id))
      fail('已关联目标必须引用存在的目标。');
  } else if (record.linked_goal_id !== null)
    fail('未回答或无具体关联目标时，关联目标ID必须为空。');
  if (
    record.rpe !== null &&
    (typeof record.rpe !== 'number' ||
      !Number.isInteger(record.rpe) ||
      record.rpe < 1 ||
      record.rpe > 10)
  )
    fail('主观用力程度必须为空或 1–10 整数。');
  textOrNull(record.note, '备注');
}
export function migrateBackup(inputVersion: unknown, data: unknown): unknown {
  if (inputVersion !== '1.0.0')
    fail('备份版本无法识别，请使用支持该版本的应用导入。');
  return data; // Future migrations belong here; no invented migration rules.
}
export function parseBackup(text: string): Backup {
  let input: unknown;
  try {
    input = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch {
    fail('文件不是有效的 JSON 备份。');
  }
  const envelope = object(input, '备份');
  validateBackup(input);
  return envelope as Backup;
}
export function validateBackup(input: unknown): asserts input is Backup {
  const envelope = object(input, '备份');
  if (envelope.format !== 'running-log-backup') fail('无法识别的备份格式。');
  migrateBackup(envelope.backup_version, input);
  keys(
    envelope,
    ['format', 'backup_version', 'exported_at', 'records', 'goals'],
    '备份',
  );
  if (!isIsoTime(envelope.exported_at)) fail('备份导出时间不正确。');
  if (!Array.isArray(envelope.goals) || !Array.isArray(envelope.records))
    fail('备份缺少记录或目标列表。');
  envelope.goals.forEach(validateGoal);
  const goals = envelope.goals as Goal[];
  for (const record of envelope.records) validateRecord(record, goals);
  const records = envelope.records as RunRecord[];
  if (
    new Set(goals.map((g) => g.goal_id)).size !== goals.length ||
    new Set(records.map((r) => r.record_id)).size !== records.length
  )
    fail('备份中存在重复ID，请检查文件。');
}
