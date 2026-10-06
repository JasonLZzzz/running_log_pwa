import { goalStatusLabels, label } from '../domain/fields';
import {
  goalLabel,
  type Backup,
  type RunRecord,
  type Snapshot,
} from '../domain/types';
import { localIso } from '../domain/time';
export function createBackup(snapshot: Snapshot, exportedAt = new Date()): Backup {
  return {
    format: 'running-log-backup',
    backup_version: '1.0.0',
    exported_at: localIso(exportedAt),
    records: snapshot.records,
    goals: snapshot.goals,
  };
}
export const jsonBackup = (snapshot: Snapshot, exportedAt = new Date()) =>
  JSON.stringify(createBackup(snapshot, exportedAt), null, 2);
export function csvEscape(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
export const CSV_HEADERS = [
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
];
export function csvRows({ records, goals }: Snapshot): string[][] {
  return records.map((r: RunRecord) => [
    r.record_id,
    r.activity_time,
    label('planned_structure', r.planned_structure),
    r.planned_structure_other ?? '',
    label('planned_intensity', r.planned_intensity),
    label('activity_context', r.activity_context),
    r.activity_context_other ?? '',
    r.slope_focus === null ? '' : label('slope_focus', r.slope_focus),
    r.surface_focus === null ? '' : label('surface_focus', r.surface_focus),
    r.surface_focus_other ?? '',
    r.additional_purposes === null
      ? ''
      : r.additional_purposes.length === 0
        ? '无附加目的'
        : r.additional_purposes
            .map((p) => label('additional_purposes', p))
            .join('；'),
    r.additional_purpose_other ?? '',
    goalStatusLabels[r.linked_goal_status],
    r.linked_goal_status === 'linked'
      ? goalLabel(goals.find((g) => g.goal_id === r.linked_goal_id)!)
      : '',
    label('completion_status', r.completion_status),
    r.rpe === null ? '' : String(r.rpe),
    r.note ?? '',
    r.created_at,
    r.updated_at,
    r.schema_version,
  ]);
}
export function exportCsv(snapshot: Snapshot): string {
  return (
    '\uFEFF' +
    [CSV_HEADERS, ...csvRows(snapshot)]
      .map((row) => row.map(csvEscape).join(','))
      .join('\r\n') +
    '\r\n'
  );
}
export function download(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
