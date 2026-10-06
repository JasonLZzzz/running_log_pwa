import { useRef, useState } from 'react';
import type { Repository } from '../data/db';
import { download, exportCsv, jsonBackup } from '../data/export';
import { localFilenameTime } from '../domain/time';
import { parseBackup, ValidationError } from '../data/schema';
import { type Counts, type MergePlan } from '../data/merge';
import {
  APP_VERSION,
  SCHEMA_VERSION,
  goalLabel,
  type Backup,
  type Goal,
} from '../domain/types';
import { GoalEditor } from '../components/Controls';
export const countsText = (c: Counts) =>
  `新增 ${c.added} / 更新 ${c.updated} / 跳过 ${c.skipped} / 错误 ${c.errors}`;
export function DataPage({
  repository,
  goals,
  refresh,
}: {
  repository: Repository;
  goals: Goal[];
  refresh: () => Promise<void>;
}) {
  const [goalEditor, setGoalEditor] = useState<Goal | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{
    backup: Backup;
    plan: MergePlan;
    name: string;
  } | null>(null);
  async function action(work: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await work();
    } catch (err) {
      setError(
        err instanceof ValidationError
          ? err.message
          : '操作失败，请检查本地存储空间与网站存储权限后重试。',
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section>
      <h1>数据</h1>
      <div className="panel">
        <h2>数据备份</h2>
        <div className="stack">
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const exportedAt = new Date();
                download(
                  jsonBackup(await repository.snapshot(), exportedAt),
                  `跑后记录备份_${localFilenameTime(exportedAt)}.json`,
                  'application/json;charset=utf-8',
                );
                setMessage('JSON 备份已导出。');
              })
            }
          >
            导出 JSON 备份
          </button>
          <button
            disabled={busy}
            onClick={() =>
              void action(async () => {
                const exportedAt = new Date();
                download(
                  exportCsv(await repository.snapshot()),
                  `跑后记录_${localFilenameTime(exportedAt)}.csv`,
                  'text/csv;charset=utf-8',
                );
                setMessage('CSV 已导出。');
              })
            }
          >
            导出 CSV
          </button>
          <label className={`file-button ${busy ? 'disabled' : ''}`}>
            导入 JSON
            <input
              aria-label="导入 JSON"
              type="file"
              accept=".json,application/json"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                setPending(null);
                void action(async () => {
                  try {
                    const backup = parseBackup(await file.text());
                    const plan = await repository.previewImport(backup);
                    setPending({ backup, plan, name: file.name });
                  } catch (err) {
                    setError(
                      `导入未执行：${err instanceof ValidationError ? err.message : '读取或预览失败，请重试。'} 新增 0 / 更新 0 / 跳过 0 / 错误 1。`,
                    );
                  }
                });
              }}
            />
          </label>
        </div>
        {pending && (
          <div className="import-preview">
            <h3>导入预览</h3>
            <p>{pending.name}</p>
            <p>{countsText(pending.plan.counts)}</p>
            <p className="subtle">
              记录：{countsText(pending.plan.recordCounts)}
              <br />
              目标：{countsText(pending.plan.goalCounts)}
            </p>
            <p>按ID合并，同ID保留更新时间较新的内容；相同时间保留本地内容。</p>
            <div className="actions">
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    const plan = await repository.importBackup(pending.backup);
                    setPending(null);
                    await refresh();
                    setMessage(
                      `导入完成：${countsText(plan.counts)}。记录：${countsText(plan.recordCounts)}。目标：${countsText(plan.goalCounts)}。`,
                    );
                  })
                }
              >
                确认导入
              </button>
              <button disabled={busy} onClick={() => setPending(null)}>
                取消导入
              </button>
            </div>
          </div>
        )}
        {busy && (
          <p role="status" className="subtle">
            正在处理本地数据，请稍候…
          </p>
        )}
        {message && (
          <p role="status" className="success">
            {message}
          </p>
        )}
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
      </div>
      <div className="panel">
        <h2>目标管理</h2>
        <button disabled={busy} onClick={() => setGoalEditor('new')}>
          新增目标
        </button>
        {!goals.length && (
          <p className="subtle">
            暂无目标，可添加赛事、个人最好成绩或阶段性目标。
          </p>
        )}
        <ul className="goal-list">
          {goals.map((goal) => (
            <li key={goal.goal_id}>
              <strong>{goalLabel(goal)}</strong>
              {goal.archived && <small>已归档</small>}
              <div className="actions">
                <button disabled={busy} onClick={() => setGoalEditor(goal)}>
                  编辑目标
                </button>
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      await repository.saveGoal(
                        {
                          name: goal.name,
                          target_date: goal.target_date,
                          archived: !goal.archived,
                        },
                        goal.goal_id,
                      );
                      await refresh();
                      setMessage(
                        goal.archived
                          ? '目标已取消归档。'
                          : '目标已归档，历史引用仍保留。',
                      );
                    })
                  }
                >
                  {goal.archived ? '取消归档' : '归档目标'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
      <div className="panel">
        <h2>本地存储说明</h2>
        <p>数据保存在当前浏览器或主屏幕应用的本地存储中，不会上传服务器。</p>
        <p>
          更换域名、清除 Safari
          网站数据或极端系统存储清理，可能导致本地数据不可见或丢失。建议定期导出
          JSON 备份。
        </p>
        <p>
          iPhone：在 Safari
          的分享菜单中选择“添加到主屏幕”。首次在线打开后，请等待顶部显示“离线可用”，再断网测试。
        </p>
      </div>
      <div className="panel">
        <h2>关于</h2>
        <p>
          应用版本：{APP_VERSION}
          <br />
          数据结构版本：{SCHEMA_VERSION}
        </p>
      </div>
      {goalEditor && (
        <GoalEditor
          goal={goalEditor === 'new' ? undefined : goalEditor}
          onClose={() => setGoalEditor(null)}
          onSave={async (input) => {
            await repository.saveGoal(
              input,
              goalEditor === 'new' ? undefined : goalEditor.goal_id,
            );
            await refresh();
            setGoalEditor(null);
          }}
        />
      )}
    </section>
  );
}
