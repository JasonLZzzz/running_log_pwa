import { useRef, useState } from 'react';
import type { Shoe, ShoeInput, ShoeType } from '../domain/types';
import {
  shoeLabel,
  shoeTypeLabel,
  shoeTypes,
  suggestedNickname,
} from '../domain/shoes';
import { ValidationError } from '../data/schema';
import type { Repository } from '../data/db';
import { Modal } from './Controls';

export function ShoeEditor({
  shoe,
  shoes,
  onSave,
  onClose,
}: {
  shoe?: Shoe;
  shoes: Shoe[];
  onSave: (input: ShoeInput, id: string) => Promise<void>;
  onClose: () => void;
}) {
  const id = useRef(shoe?.shoe_id ?? crypto.randomUUID());
  const [brand, setBrand] = useState(shoe?.brand ?? '');
  const [model, setModel] = useState(shoe?.model ?? '');
  const [manualNickname, setNickname] = useState<string | null>(
    shoe?.nickname ?? null,
  );
  const nickname = manualNickname ?? suggestedNickname(shoes, brand, model);
  const [type, setType] = useState<ShoeType | null>(shoe?.shoe_type ?? null);
  const [status, setStatus] = useState<Shoe['status']>(
    shoe?.status ?? 'active',
  );
  const [note, setNote] = useState(shoe?.note ?? '');
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <Modal
      title={shoe ? '编辑鞋子' : '新增鞋子'}
      onClose={() => {
        if (!busy.current) onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          if (busy.current) return;
          busy.current = true;
          setSaving(true);
          setError('');
          try {
            await onSave(
              {
                brand,
                model,
                nickname,
                shoe_type: type,
                status,
                note: note || null,
              },
              id.current,
            );
          } catch (error) {
            setError(
              error instanceof ValidationError
                ? error.message
                : '鞋子保存失败，请检查本地存储并重试；当前输入已保留。',
            );
          } finally {
            busy.current = false;
            setSaving(false);
          }
        }}
      >
        <label className="text-field">
          品牌
          <input
            required
            autoFocus
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
          />
        </label>
        <label className="text-field">
          鞋款型号
          <input
            required
            value={model}
            onChange={(event) => setModel(event.target.value)}
          />
        </label>
        <label className="text-field">
          编号/昵称
          <input
            required
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
          />
        </label>
        <label className="text-field">
          鞋子主要类型
          <select
            value={type ?? ''}
            onChange={(event) =>
              setType((event.target.value || null) as ShoeType | null)
            }
          >
            <option value="">未填写</option>
            {shoeTypes.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-field">
          使用状态
          <select
            value={status}
            onChange={(event) =>
              setStatus(event.target.value as Shoe['status'])
            }
          >
            <option value="active">在用</option>
            <option value="retired">已退役</option>
          </select>
        </label>
        <label className="text-field">
          鞋子备注
          <textarea
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        <button
          className="primary"
          disabled={
            saving || !brand.trim() || !model.trim() || !nickname.trim()
          }
        >
          {saving ? '保存中…' : '保存鞋子'}
        </button>
      </form>
    </Modal>
  );
}

export function ShoePicker({
  shoes,
  value,
  onChange,
  onNew,
}: {
  shoes: Shoe[];
  value: string | null;
  onChange: (id: string | null) => void;
  onNew: () => void;
}) {
  const [retired, setRetired] = useState(false);
  return (
    <fieldset>
      <legend>本次用鞋</legend>
      {!shoes.length && (
        <p className="subtle">鞋库暂无跑鞋，可先保存记录，之后补录。</p>
      )}
      <div className="chips">
        <button
          type="button"
          aria-pressed={value === null}
          className={value === null ? 'selected' : ''}
          onClick={() => onChange(null)}
        >
          未填写
        </button>
        {shoes
          .filter(
            (shoe) =>
              shoe.status === 'active' || retired || shoe.shoe_id === value,
          )
          .map((shoe) => (
            <button
              type="button"
              key={shoe.shoe_id}
              aria-pressed={shoe.shoe_id === value}
              className={shoe.shoe_id === value ? 'selected' : ''}
              onClick={() =>
                onChange(value === shoe.shoe_id ? null : shoe.shoe_id)
              }
            >
              {shoeLabel(shoe)}
              {shoe.status === 'retired' && '（已退役）'}
            </button>
          ))}
      </div>
      <div className="actions">
        <button type="button" onClick={onNew}>
          ＋ 新增鞋子
        </button>
        {shoes.some((shoe) => shoe.status === 'retired') && (
          <button
            type="button"
            aria-pressed={retired}
            onClick={() => setRetired(!retired)}
          >
            {retired ? '隐藏已退役' : '显示已退役'}
          </button>
        )}
      </div>
    </fieldset>
  );
}

export function ShoeManager({
  repository,
  shoes,
  refresh,
}: {
  repository: Repository;
  shoes: Shoe[];
  refresh: () => Promise<void>;
}) {
  const [editor, setEditor] = useState<Shoe | 'new' | null>(null);
  const [retired, setRetired] = useState(false);
  const busy = useRef(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  return (
    <div className="panel">
      <h2>鞋库管理</h2>
      <button disabled={saving} onClick={() => setEditor('new')}>
        ＋ 新增鞋子
      </button>
      {!shoes.length && (
        <p className="subtle">鞋库暂无跑鞋。每条鞋库记录代表一双具体的跑鞋。</p>
      )}
      <ul className="goal-list">
        {shoes
          .filter((shoe) => shoe.status === 'active' || retired)
          .map((shoe) => (
            <li key={shoe.shoe_id}>
              <strong>{shoeLabel(shoe)}</strong>
              <small>
                {shoe.status === 'active' ? '在用' : '已退役'}
                {shoe.shoe_type && ` · ${shoeTypeLabel(shoe.shoe_type)}`}
              </small>
              <div className="actions">
                <button disabled={saving} onClick={() => setEditor(shoe)}>
                  编辑鞋子
                </button>
                <button
                  disabled={saving}
                  onClick={async () => {
                    if (busy.current) return;
                    busy.current = true;
                    setSaving(true);
                    setError('');
                    try {
                      await repository.saveShoe(
                        {
                          brand: shoe.brand,
                          model: shoe.model,
                          nickname: shoe.nickname,
                          shoe_type: shoe.shoe_type,
                          status:
                            shoe.status === 'active' ? 'retired' : 'active',
                          note: shoe.note,
                        },
                        shoe.shoe_id,
                      );
                      await refresh();
                    } catch (error) {
                      setError(
                        error instanceof ValidationError
                          ? error.message
                          : '鞋子状态保存失败，请重试。',
                      );
                    } finally {
                      busy.current = false;
                      setSaving(false);
                    }
                  }}
                >
                  {shoe.status === 'active' ? '退役' : '恢复在用'}
                </button>
              </div>
            </li>
          ))}
      </ul>
      {shoes.some((shoe) => shoe.status === 'retired') && (
        <button aria-pressed={retired} onClick={() => setRetired(!retired)}>
          {retired ? '隐藏已退役' : '显示已退役'}
        </button>
      )}
      {saving && <p role="status">正在保存鞋子状态…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {editor && (
        <ShoeEditor
          shoe={editor === 'new' ? undefined : editor}
          shoes={shoes}
          onClose={() => setEditor(null)}
          onSave={async (input, id) => {
            await repository.saveShoe(input, id);
            await refresh();
            setEditor(null);
          }}
        />
      )}
    </div>
  );
}
