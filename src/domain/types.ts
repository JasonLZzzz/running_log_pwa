import type { Code } from './fields';
export const SCHEMA_VERSION = '2.0.0';
export const APP_VERSION = '2.1.0';
export type RunRecord = {
  record_id: string;
  schema_version: typeof SCHEMA_VERSION;
  activity_time: string;
  created_at: string;
  updated_at: string;
  planned_structure: Code<'planned_structure'>;
  planned_structure_other: string | null;
  planned_intensity: Code<'planned_intensity'>;
  activity_context: Code<'activity_context'>;
  activity_context_other: string | null;
  slope_focus: Code<'slope_focus'> | null;
  surface_focus: Code<'surface_focus'> | null;
  surface_focus_other: string | null;
  additional_purposes: Code<'additional_purposes'>[] | null;
  additional_purpose_other: string | null;
  linked_goal_status: 'unset' | 'none' | 'linked';
  linked_goal_id: string | null;
  completion_status: Code<'completion_status'>;
  rpe: number | null;
  note: string | null;
  shoe_id: string | null;
};
export type Goal = {
  goal_id: string;
  schema_version: typeof SCHEMA_VERSION;
  name: string;
  target_date: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
};
export type ShoeType = 'daily' | 'speed' | 'race' | 'trail' | 'other';
export type Shoe = {
  shoe_id: string;
  brand: string;
  model: string;
  nickname: string;
  shoe_type: ShoeType | null;
  status: 'active' | 'retired';
  note: string | null;
  schema_version: typeof SCHEMA_VERSION;
  created_at: string;
  updated_at: string;
};
export type ShoeInput = Omit<
  Shoe,
  'shoe_id' | 'schema_version' | 'created_at' | 'updated_at'
>;
export type Snapshot = { records: RunRecord[]; goals: Goal[]; shoes: Shoe[] };
export type Backup = Snapshot & {
  format: 'running-log-backup';
  backup_version: '2.0.0';
  exported_at: string;
};
export type LegacyGoal = Omit<Goal, 'schema_version'> & {
  schema_version: '1.0.0';
};
export type LegacyRecord = Omit<RunRecord, 'schema_version' | 'shoe_id'> & {
  schema_version: '1.0.0';
};
export type LegacyBackup = {
  format: 'running-log-backup';
  backup_version: '1.0.0';
  exported_at: string;
  records: LegacyRecord[];
  goals: LegacyGoal[];
};
export type BackupSource = Backup | LegacyBackup;
export type RecordInput = Omit<
  RunRecord,
  'record_id' | 'schema_version' | 'created_at' | 'updated_at'
>;
export type GoalInput = Pick<Goal, 'name' | 'target_date' | 'archived'>;
export const goalLabel = (goal: Goal) =>
  goal.name + (goal.target_date ? `｜${goal.target_date}` : '');
