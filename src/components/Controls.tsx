import { useEffect, useRef, useState, type ReactNode } from 'react';
import { type Option } from '../domain/fields';
import { isDate } from '../data/schema';
import type { Goal, GoalInput } from '../domain/types';
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      aria-label={title}
    >
      <div className="dialog-heading">
        <h2>{title}</h2>
        <button type="button" onClick={onClose}>
          关闭
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Help({
  title,
  text,
  options = [],
}: {
  title: string;
  text: string;
  options?: readonly Option[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="help"
        aria-label={`${title}帮助`}
        onClick={() => setOpen(true)}
      >
        ？
      </button>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          <p>{text}</p>
          <dl>
            {options.map((o) => (
              <div key={o.code}>
                <dt>{o.label}</dt>
                <dd>{o.help}</dd>
              </div>
            ))}
          </dl>
        </Modal>
      )}
    </>
  );
}
export function Choices({
  title,
  help,
  options,
  value,
  onChange,
  optional = false,
  multiple = false,
}: {
  title: string;
  help: string;
  options: readonly Option[];
  value: string | string[] | null;
  onChange: (code: string | null) => void;
  optional?: boolean;
  multiple?: boolean;
}) {
  return (
    <fieldset>
      <legend>
        {title}
        <Help title={title} text={help} options={options} />
      </legend>
      <div className="chips">
        {optional && (
          <button
            type="button"
            className={value === null ? 'selected' : ''}
            aria-pressed={value === null}
            onClick={() => onChange(null)}
          >
            未填写
          </button>
        )}
        {options.map((o) => {
          const selected = Array.isArray(value)
            ? value.includes(o.code)
            : value === o.code;
          return (
            <button
              type="button"
              key={o.code}
              aria-pressed={selected}
              className={selected ? 'selected' : ''}
              onClick={() => onChange(o.code)}
            >
              {multiple && (
                <span aria-hidden="true">{selected ? '✓ ' : '+ '}</span>
              )}
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
export function OtherInput({
  title,
  value,
  onChange,
}: {
  title: string;
  value: string | null;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-field">
      {title}：请补充具体类型
      <textarea
        required
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
      />
    </label>
  );
}
export function GoalEditor({
  goal,
  onSave,
  onClose,
}: {
  goal?: Goal;
  onSave: (input: GoalInput) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(goal?.name ?? '');
  const [date, setDate] = useState(goal?.target_date ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const busy = useRef(false);
  return (
    <Modal
      title={goal ? '编辑目标' : '新增目标'}
      onClose={() => {
        if (!busy.current) onClose();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (busy.current) return;
          busy.current = true;
          setSaving(true);
          setError('');
          try {
            await onSave({
              name: name.trim(),
              target_date: date || null,
              archived: goal?.archived ?? false,
            });
          } catch {
            setError('目标保存失败，请检查本地存储后重试。');
          } finally {
            busy.current = false;
            setSaving(false);
          }
        }}
      >
        <label className="text-field">
          目标名称
          <input
            autoFocus
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="text-field">
          目标日期（可不填）
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        {error && <p role="alert">{error}</p>}
        <button
          className="primary"
          disabled={saving || !name.trim() || (!!date && !isDate(date))}
        >
          {saving ? '保存中…' : '保存目标'}
        </button>
      </form>
    </Modal>
  );
}
