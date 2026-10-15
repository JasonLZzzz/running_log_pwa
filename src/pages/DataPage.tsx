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
  type BackupSource,
  type Goal,
  type Shoe,
} from '../domain/types';
import { GoalEditor } from '../components/Controls';
import { ShoeManager } from '../components/Shoes';
export const countsText = (c: Counts) =>
  `新增 ${c.added} / 更新 ${c.updated} / 跳过 ${c.skipped} / 错误 ${c.errors}`;
function TransferIcon({ upload = false }: { upload?: boolean }) {
  return (
    <svg
      className="backup-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M4 15v5h16v-5" />
      <path d={upload ? 'M12 16V4m-5 5 5-5 5 5' : 'M12 4v12m-5-5 5 5 5-5'} />
    </svg>
  );
}
export function DataPage({
  repository,
  goals,
  shoes,
  refresh,
}: {
  repository: Repository;
  goals: Goal[];
  shoes: Shoe[];
  refresh: () => Promise<void>;
}) {
  const [goalEditor, setGoalEditor] = useState<Goal | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState<{
    backup: BackupSource;
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
        <section
          className="backup-export"
          aria-labelledby="backup-export-title"
        >
          <h3 id="backup-export-title">导出数据</h3>
          <div className="backup-export-options">
            <div className="backup-option">
              <button
                aria-describedby="backup-json-description"
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
                <TransferIcon />
                <span>导出 JSON 备份</span>
              </button>
              <p className="subtle" id="backup-json-description">
                包含完整记录、目标和鞋库，用于备份与恢复。
              </p>
            </div>
            <div className="backup-option">
              <button
                aria-describedby="backup-csv-description"
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
                <TransferIcon />
                <span>导出 CSV</span>
              </button>
              <p className="subtle" id="backup-csv-description">
                用于表格查看、整理及后续分析。
              </p>
            </div>
          </div>
        </section>
        <section
          className="backup-import"
          aria-labelledby="backup-import-title"
        >
          <h3 id="backup-import-title">导入数据</h3>
          <p className="subtle" id="backup-import-description">
            从 JSON 备份导入数据，操作前先预览合并结果。
          </p>
          <label
            className={`file-button backup-file-button ${busy ? 'disabled' : ''}`}
          >
            <TransferIcon upload />
            <span>导入 JSON</span>
            <input
              aria-label="导入 JSON"
              aria-describedby="backup-import-description"
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
        </section>
        {pending && (
          <div className="import-preview">
            <h3>导入预览</h3>
            <p>{pending.name}</p>
            <p>{countsText(pending.plan.counts)}</p>
            <p className="subtle">
              记录：{countsText(pending.plan.recordCounts)}
              <br />
              目标：{countsText(pending.plan.goalCounts)}
              <br />
              鞋库：{countsText(pending.plan.shoeCounts)}
            </p>
            {pending.backup.backup_version === '1.0.0' && (
              <p>
                旧版备份没有用鞋信息；将保护本地已有用鞋关联。本次保护{' '}
                {pending.plan.protectedShoeLinks} 条关联。
              </p>
            )}
            <p className="subtle">
              鞋子按唯一 ID 合并；不同 ID 的同名鞋会分别保留。
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
                      `导入完成：${countsText(plan.counts)}。记录：${countsText(plan.recordCounts)}。目标：${countsText(plan.goalCounts)}。鞋库：${countsText(plan.shoeCounts)}。保护已有用鞋关联 ${plan.protectedShoeLinks} 条。`,
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
      <ShoeManager repository={repository} shoes={shoes} refresh={refresh} />
      <div className="panel">
        <h2>本地存储说明</h2>
        <p>
          新版 JSON
          备份包含鞋库与用鞋关联；旧版备份可以导入，但没有用鞋信息。不同 ID
          的同名鞋不会自动合并。
        </p>
        <p>
          数据库升级后不能直接退回 V2.0.1。请保留升级前的外部 JSON
          备份；遇到问题不要卸载 PWA
          或清理网站数据，应使用兼容新版数据库的修复版本。
        </p>
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
