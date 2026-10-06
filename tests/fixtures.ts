import type { Backup, Goal, RecordInput, RunRecord } from '../src/domain/types';
export const t0 = '2026-10-06T10:00:00+08:00';
export const t1 = '2026-10-06T11:00:00+08:00';
export const t2 = '2026-10-06T12:00:00+08:00';
export const recordId = '11111111-1111-4111-8111-111111111111';
export const goalId = '22222222-2222-4222-8222-222222222222';
export function recordInput(patch: Partial<RecordInput> = {}): RecordInput {
  return {
    activity_time: t0,
    planned_structure: 'continuous_steady',
    planned_structure_other: null,
    planned_intensity: 'easy',
    activity_context: 'regular_training',
    activity_context_other: null,
    slope_focus: null,
    surface_focus: null,
    surface_focus_other: null,
    additional_purposes: null,
    additional_purpose_other: null,
    linked_goal_status: 'unset',
    linked_goal_id: null,
    completion_status: 'as_planned',
    rpe: null,
    note: null,
    ...patch,
  };
}
export function record(patch: Partial<RunRecord> = {}): RunRecord {
  return {
    ...recordInput(),
    record_id: recordId,
    schema_version: '1.0.0',
    created_at: t0,
    updated_at: t0,
    ...patch,
  };
}
export function goal(patch: Partial<Goal> = {}): Goal {
  return {
    goal_id: goalId,
    schema_version: '1.0.0',
    name: '测试目标',
    target_date: '2026-10-31',
    archived: false,
    created_at: t0,
    updated_at: t0,
    ...patch,
  };
}
export function backup(records: RunRecord[] = [], goals: Goal[] = []): Backup {
  return {
    format: 'running-log-backup',
    backup_version: '1.0.0',
    exported_at: t2,
    records,
    goals,
  };
}
