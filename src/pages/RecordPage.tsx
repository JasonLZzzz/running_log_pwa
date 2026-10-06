import { useRef, useState } from 'react';
import { fields, rpeHelp, type Code } from '../domain/fields';
import {
  draftErrors,
  draftInput,
  newDraft,
  togglePurpose,
  type Draft,
} from '../domain/draft';
import { goalLabel, type Goal, type RunRecord } from '../domain/types';
import { Choices, GoalEditor, Help, OtherInput } from '../components/Controls';
import type { Repository } from '../data/db';
import { ValidationError } from '../data/schema';
export function RecordPage({
  repository,
  goals,
  record,
  onSaved,
  refresh,
  onDirty,
}: {
  repository: Repository;
  goals: Goal[];
  record?: RunRecord;
  onSaved: (record: RunRecord) => void;
  refresh: () => Promise<void>;
  onDirty: (dirty: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => newDraft(record));
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const recordId = useRef(record?.record_id ?? crypto.randomUUID());
  const [error, setError] = useState('');
  const [newGoal, setNewGoal] = useState(false);
  const [archived, setArchived] = useState(false);
  const errors = draftErrors(draft);
  function change(patch: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...patch }));
    onDirty(true);
  }
  const single = <
    K extends
      | 'planned_structure'
      | 'planned_intensity'
      | 'activity_context'
      | 'slope_focus'
      | 'surface_focus'
      | 'completion_status',
  >(
    key: K,
  ) => (
    <Choices
      title={fields[key].label}
      help={fields[key].help}
      options={fields[key].options}
      value={draft[key]}
      optional={key === 'slope_focus' || key === 'surface_focus'}
      onChange={(code) => {
        const patch: Partial<Draft> = { [key]: code };
        if (key === 'planned_structure' && code !== 'other')
          patch.planned_structure_other = null;
        if (key === 'activity_context' && code !== 'other')
          patch.activity_context_other = null;
        if (key === 'surface_focus' && code !== 'other')
          patch.surface_focus_other = null;
        change(patch);
      }}
    />
  );
  return (
    <section>
      <h1>{record ? '编辑跑步记录' : '记录本次跑步'}</h1>
      <p className="subtle">记录原计划、意图与跑后感受</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy.current || errors.length) return;
          busy.current = true;
          setSaving(true);
          setError('');
          try {
            const saved = await repository.saveRecord(
              draftInput(draft, record),
              recordId.current,
            );
            onDirty(false);
            onSaved(saved);
          } catch (err) {
            setError(
              err instanceof ValidationError
                ? err.message
                : '记录保存失败，请检查本地存储空间与网站存储权限后重试。',
            );
          } finally {
            busy.current = false;
            setSaving(false);
          }
        }}
      >
        <label className="text-field">
          训练时间
          <input
            type="datetime-local"
            required
            value={draft.activity_time}
            onChange={(e) => change({ activity_time: e.target.value })}
          />
        </label>
        {single('planned_structure')}
        {draft.planned_structure === 'other' && (
          <OtherInput
            title="计划结构"
            value={draft.planned_structure_other}
            onChange={(v) => change({ planned_structure_other: v })}
          />
        )}
        {single('planned_intensity')}
        {single('activity_context')}
        {draft.activity_context === 'other' && (
          <OtherInput
            title="活动情境"
            value={draft.activity_context_other}
            onChange={(v) => change({ activity_context_other: v })}
          />
        )}
        <details className="advanced">
          <summary>专项与其他信息</summary>
          {single('slope_focus')}
          {single('surface_focus')}
          {draft.surface_focus === 'other' && (
            <OtherInput
              title="路面专项"
              value={draft.surface_focus_other}
              onChange={(v) => change({ surface_focus_other: v })}
            />
          )}
          <fieldset>
            <legend>
              附加目的
              <Help
                title="附加目的"
                text={fields.additional_purposes.help}
                options={fields.additional_purposes.options}
              />
            </legend>
            <div className="chips">
              <button
                type="button"
                aria-pressed={draft.additional_purposes === null}
                className={draft.additional_purposes === null ? 'selected' : ''}
                onClick={() =>
                  change({
                    additional_purposes: null,
                    additional_purpose_other: null,
                  })
                }
              >
                未填写
              </button>
              <button
                type="button"
                aria-pressed={draft.additional_purposes?.length === 0}
                className={
                  draft.additional_purposes?.length === 0 ? 'selected' : ''
                }
                onClick={() =>
                  change({
                    additional_purposes: [],
                    additional_purpose_other: null,
                  })
                }
              >
                无附加目的
              </button>
            </div>
            <p className="subtle">可多选；取消最后一项恢复“未填写”。</p>
            <div className="chips">
              {fields.additional_purposes.options.map((o) => (
                <button
                  type="button"
                  key={o.code}
                  aria-pressed={
                    draft.additional_purposes?.includes(o.code) ?? false
                  }
                  className={
                    draft.additional_purposes?.includes(o.code)
                      ? 'selected'
                      : ''
                  }
                  onClick={() => {
                    const next = togglePurpose(
                      draft.additional_purposes,
                      o.code as Code<'additional_purposes'>,
                    );
                    change({
                      additional_purposes: next,
                      additional_purpose_other: next?.includes('other')
                        ? draft.additional_purpose_other
                        : null,
                    });
                  }}
                >
                  <span aria-hidden="true">
                    {draft.additional_purposes?.includes(o.code) ? '✓ ' : '+ '}
                  </span>
                  {o.label}
                </button>
              ))}
            </div>
          </fieldset>
          {draft.additional_purposes?.includes('other') && (
            <OtherInput
              title="附加目的"
              value={draft.additional_purpose_other}
              onChange={(v) => change({ additional_purpose_other: v })}
            />
          )}
          <fieldset>
            <legend>
              关联目标
              <Help
                title="关联目标"
                text="这次训练是否服务于某个具体目标？关联某场比赛与比赛模拟不等价。"
              />
            </legend>
            <div className="chips">
              <button
                type="button"
                aria-pressed={draft.linked_goal_status === 'unset'}
                className={
                  draft.linked_goal_status === 'unset' ? 'selected' : ''
                }
                onClick={() =>
                  change({ linked_goal_status: 'unset', linked_goal_id: null })
                }
              >
                未回答
              </button>
              <button
                type="button"
                aria-pressed={draft.linked_goal_status === 'none'}
                className={
                  draft.linked_goal_status === 'none' ? 'selected' : ''
                }
                onClick={() =>
                  change({ linked_goal_status: 'none', linked_goal_id: null })
                }
              >
                无具体关联目标
              </button>
              {goals
                .filter(
                  (g) =>
                    !g.archived ||
                    archived ||
                    g.goal_id === draft.linked_goal_id,
                )
                .map((g) => (
                  <button
                    type="button"
                    key={g.goal_id}
                    aria-pressed={g.goal_id === draft.linked_goal_id}
                    className={
                      g.goal_id === draft.linked_goal_id ? 'selected' : ''
                    }
                    onClick={() =>
                      change({
                        linked_goal_status: 'linked',
                        linked_goal_id: g.goal_id,
                      })
                    }
                  >
                    {goalLabel(g)}
                    {g.archived && '（已归档）'}
                  </button>
                ))}
            </div>
            <div className="actions">
              <button type="button" onClick={() => setNewGoal(true)}>
                ＋ 新增目标
              </button>
              {goals.some((g) => g.archived) && (
                <button
                  type="button"
                  aria-pressed={archived}
                  onClick={() => setArchived(!archived)}
                >
                  {archived ? '隐藏已归档' : '查看已归档'}
                </button>
              )}
            </div>
          </fieldset>
        </details>
        {single('completion_status')}
        <fieldset>
          <legend>
            主观用力程度（RPE）
            <Help
              title="主观用力程度（RPE）"
              text="整次活动结束后的总体主观用力程度。不是最痛苦那一分钟，也不等同于心率区间。"
              options={rpeHelp.map((help, i) => ({
                code: String(i + 1),
                label: String(i + 1),
                help,
              }))}
            />
          </legend>
          <button
            type="button"
            className={draft.rpe === null ? 'selected' : ''}
            aria-pressed={draft.rpe === null}
            onClick={() => change({ rpe: null })}
          >
            未填写
          </button>
          <div className="rpe-grid">
            {rpeHelp.map((help, i) => (
              <button
                type="button"
                key={i}
                title={help}
                aria-label={`RPE ${i + 1}`}
                aria-pressed={draft.rpe === i + 1}
                className={draft.rpe === i + 1 ? 'selected' : ''}
                onClick={() => change({ rpe: i + 1 })}
              >
                {i + 1}
              </button>
            ))}
          </div>
          {draft.rpe && <p className="subtle">{rpeHelp[draft.rpe - 1]}</p>}
        </fieldset>
        <label className="text-field">
          备注
          <textarea
            rows={4}
            value={draft.note ?? ''}
            onChange={(e) => change({ note: e.target.value || null })}
            placeholder="有什么值得以后复盘的信息？"
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <div className="save-area">
          {errors.length > 0 && (
            <p className="subtle" aria-live="polite">
              {errors.join(' ')}
            </p>
          )}
          <button className="primary" disabled={saving || errors.length > 0}>
            {saving ? '保存中…' : '保存记录'}
          </button>
        </div>
      </form>
      {newGoal && (
        <GoalEditor
          onClose={() => setNewGoal(false)}
          onSave={async (input) => {
            const goal = await repository.saveGoal(input);
            await refresh();
            change({
              linked_goal_status: 'linked',
              linked_goal_id: goal.goal_id,
            });
            setNewGoal(false);
          }}
        />
      )}
    </section>
  );
}
