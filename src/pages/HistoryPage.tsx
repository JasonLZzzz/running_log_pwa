import { useState } from 'react';
import { fields, goalStatusLabels, label } from '../domain/fields';
import { displayTime } from '../domain/time';
import { goalLabel, type Goal, type RunRecord } from '../domain/types';
import { Modal } from '../components/Controls';
export function RecordSummary({
  record,
  goals,
}: {
  record: RunRecord;
  goals: Goal[];
}) {
  const goal = goals.find((g) => g.goal_id === record.linked_goal_id);
  return (
    <>
      <time dateTime={record.activity_time}>
        {displayTime(record.activity_time)}
      </time>
      <strong>
        {label('planned_structure', record.planned_structure)} ·{' '}
        {label('planned_intensity', record.planned_intensity)}
      </strong>
      <span>{label('activity_context', record.activity_context)}</span>
      <span>
        {label('completion_status', record.completion_status)}
        {record.rpe !== null && ` · RPE ${record.rpe}`}
      </span>
      {goal && <small>{goalLabel(goal)}</small>}
    </>
  );
}
export function RecordDetail({
  record,
  goals,
  onEdit,
  onDelete,
  onClose,
}: {
  record: RunRecord;
  goals: Goal[];
  onEdit: (record: RunRecord) => void;
  onDelete: (id: string) => Promise<void>;
  onClose: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rows: [string, string][] = [
    ['训练时间', displayTime(record.activity_time)],
  ];
  for (const key of [
    'planned_structure',
    'planned_intensity',
    'activity_context',
    'slope_focus',
    'surface_focus',
  ] as const)
    rows.push([fields[key].label, label(key, record[key])]);
  for (const [title, value] of [
    ['计划结构-其他说明', record.planned_structure_other],
    ['活动情境-其他说明', record.activity_context_other],
    ['路面专项-其他说明', record.surface_focus_other],
  ] as const)
    if (value !== null) rows.push([title, value]);
  rows.push([
    '附加目的',
    record.additional_purposes === null
      ? '未填写'
      : record.additional_purposes.length === 0
        ? '无附加目的'
        : record.additional_purposes
            .map((p) => label('additional_purposes', p))
            .join('；'),
  ]);
  if (record.additional_purpose_other !== null)
    rows.push(['附加目的-其他说明', record.additional_purpose_other]);
  rows.push([
    '关联目标',
    record.linked_goal_status === 'linked'
      ? goalLabel(goals.find((g) => g.goal_id === record.linked_goal_id)!)
      : goalStatusLabels[record.linked_goal_status],
  ]);
  rows.push(
    ['完成情况', label('completion_status', record.completion_status)],
    [
      '主观用力程度（RPE）',
      record.rpe === null ? '未填写' : String(record.rpe),
    ],
    ['备注', record.note ?? '未填写'],
  );
  return (
    <Modal
      title="记录详情"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <dl className="detail-list">
        {rows.map(([title, value]) => (
          <div key={title}>
            <dt>{title}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <details>
        <summary>记录信息</summary>
        <dl className="detail-list">
          <dt>记录ID</dt>
          <dd>{record.record_id}</dd>
          <dt>创建时间</dt>
          <dd>{record.created_at}</dd>
          <dt>更新时间</dt>
          <dd>{record.updated_at}</dd>
          <dt>数据结构版本</dt>
          <dd>{record.schema_version}</dd>
        </dl>
      </details>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {confirm ? (
        <div className="delete-confirm">
          <p>删除后只能通过备份恢复。</p>
          <div className="actions">
            <button
              className="danger"
              disabled={busy}
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                try {
                  await onDelete(record.record_id);
                  onClose();
                } catch {
                  setError('删除失败，请重试。');
                } finally {
                  setBusy(false);
                }
              }}
            >
              确认删除
            </button>
            <button disabled={busy} onClick={() => setConfirm(false)}>
              取消
            </button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button className="primary" onClick={() => onEdit(record)}>
            编辑记录
          </button>
          <button className="danger" onClick={() => setConfirm(true)}>
            删除记录
          </button>
        </div>
      )}
    </Modal>
  );
}
export function HistoryPage({
  records,
  goals,
  onView,
}: {
  records: RunRecord[];
  goals: Goal[];
  onView: (record: RunRecord) => void;
}) {
  const [limit, setLimit] = useState(50);
  return (
    <section>
      <h1>历史记录</h1>
      <p className="subtle">共 {records.length} 条 · 按训练时间倒序</p>
      {!records.length && (
        <div className="empty">
          暂无记录。保存一次跑后记录，即可在这里查看。
        </div>
      )}
      <div className="history-list">
        {records.slice(0, limit).map((record) => (
          <button
            type="button"
            className="record-card"
            key={record.record_id}
            onClick={() => onView(record)}
            aria-label={`查看 ${displayTime(record.activity_time)} 的记录`}
          >
            <RecordSummary record={record} goals={goals} />
          </button>
        ))}
      </div>
      {limit < records.length && (
        <button className="load-more" onClick={() => setLimit((l) => l + 50)}>
          显示更多记录
        </button>
      )}
    </section>
  );
}
