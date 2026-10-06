import { fields, type Code } from './fields';
import { localInputTime, localIso } from './time';
import type { RecordInput, RunRecord } from './types';
export type Draft = Omit<
  RecordInput,
  | 'planned_structure'
  | 'planned_intensity'
  | 'activity_context'
  | 'completion_status'
> & {
  planned_structure: Code<'planned_structure'> | '';
  planned_intensity: Code<'planned_intensity'> | '';
  activity_context: Code<'activity_context'> | '';
  completion_status: Code<'completion_status'> | '';
};
export function newDraft(record?: RunRecord): Draft {
  if (record) {
    const {
      record_id: _id,
      created_at: _created,
      updated_at: _updated,
      schema_version: _schema,
      ...input
    } = record;
    void _id;
    void _created;
    void _updated;
    void _schema;
    return {
      ...input,
      activity_time: localInputTime(new Date(record.activity_time)),
      additional_purposes: record.additional_purposes?.slice() ?? null,
    };
  }
  return {
    activity_time: localInputTime(),
    planned_structure: '',
    planned_structure_other: null,
    planned_intensity: '',
    activity_context: '',
    activity_context_other: null,
    slope_focus: null,
    surface_focus: null,
    surface_focus_other: null,
    additional_purposes: null,
    additional_purpose_other: null,
    linked_goal_status: 'unset',
    linked_goal_id: null,
    completion_status: '',
    rpe: null,
    note: null,
  };
}
export function draftErrors(draft: Draft): string[] {
  const errors: string[] = [];
  if (
    !draft.activity_time ||
    !Number.isFinite(new Date(draft.activity_time).getTime())
  )
    errors.push('请填写有效的训练时间。');
  for (const key of [
    'planned_structure',
    'planned_intensity',
    'activity_context',
    'completion_status',
  ] as const)
    if (!draft[key]) errors.push(`请选择${fields[key].label}。`);
  for (const [key, other] of [
    ['planned_structure', 'planned_structure_other'],
    ['activity_context', 'activity_context_other'],
    ['surface_focus', 'surface_focus_other'],
  ] as const) {
    if (draft[key] === 'other' && !draft[other]?.trim())
      errors.push(`${fields[key].label}：请补充具体类型。`);
  }
  if (
    draft.additional_purposes?.includes('other') &&
    !draft.additional_purpose_other?.trim()
  )
    errors.push('附加目的：请补充具体类型。');
  if (draft.linked_goal_status === 'linked' && !draft.linked_goal_id)
    errors.push('请选择关联目标。');
  return errors;
}
export function draftInput(draft: Draft, existing?: RunRecord): RecordInput {
  const errors = draftErrors(draft);
  if (errors.length) throw new Error(errors.join(' '));
  return {
    ...(draft as RecordInput),
    activity_time:
      existing &&
      localInputTime(new Date(existing.activity_time)) === draft.activity_time
        ? existing.activity_time
        : localIso(new Date(draft.activity_time)),
  };
}
export function togglePurpose(
  current: Code<'additional_purposes'>[] | null,
  code: Code<'additional_purposes'>,
): Code<'additional_purposes'>[] | null {
  if (!current?.includes(code)) return [...(current ?? []), code];
  const next = current.filter((value) => value !== code);
  // Deselecting the last item is unanswered, not an implicit declaration of none.
  return next.length ? next : null;
}
