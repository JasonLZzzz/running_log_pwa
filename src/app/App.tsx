import { useCallback, useEffect, useState } from 'react';
import { Repository } from '../data/db';
import type { RunRecord, Snapshot } from '../domain/types';
import { RecordPage } from '../pages/RecordPage';
import { HistoryPage, RecordDetail, RecordSummary } from '../pages/HistoryPage';
import { DataPage } from '../pages/DataPage';
import { usePwa } from './pwa';
type Page = 'record' | 'history' | 'data';
export function App() {
  const [repository] = useState(
    () =>
      new Repository(
        'running_log_db',
        () =>
          setError(
            '数据库升级被另一个页面阻挡，请关闭其他跑后记录页面后重试。',
          ),
        () => setError('数据库连接已中断，请刷新页面重新连接。'),
      ),
  );
  const [snapshot, setSnapshot] = useState<Snapshot>({
    records: [],
    goals: [],
  });
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [page, setPage] = useState<Page>('record');
  const [editing, setEditing] = useState<RunRecord>();
  const [saved, setSaved] = useState<RunRecord>();
  const [viewing, setViewing] = useState<RunRecord>();
  const [dirty, setDirty] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const pwa = usePwa();
  const refresh = useCallback(async () => {
    setSnapshot(await repository.snapshot());
  }, [repository]);
  useEffect(() => {
    void refresh()
      .then(() => setLoaded(true))
      .catch(() =>
        setError(
          '无法打开本地数据库。请允许网站存储并刷新重试；当前记录尚未保存。',
        ),
      );
    const focus = () => {
      void refresh().catch(() => setError('本地数据读取失败，请刷新重试。'));
    };
    window.addEventListener('focus', focus);
    return () => {
      window.removeEventListener('focus', focus);
    };
  }, [refresh]);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', unload);
    return () => window.removeEventListener('beforeunload', unload);
  }, [dirty]);
  function navigate(next: Page) {
    if (next === page) return;
    if (dirty && !window.confirm('当前记录尚未保存，是否离开并放弃修改？'))
      return;
    setDirty(false);
    setPage(next);
    setEditing(undefined);
    setSaved(undefined);
    setFormKey((key) => key + 1);
    window.scrollTo(0, 0);
  }
  function edit(record: RunRecord) {
    setViewing(undefined);
    setSaved(undefined);
    setEditing(record);
    setDirty(false);
    setPage('record');
    setFormKey((key) => key + 1);
    window.scrollTo(0, 0);
  }
  return (
    <>
      <header className="app-header">
        <span>跑后记录</span>
        <small role="status">{pwa.status}</small>
      </header>
      {pwa.waiting && (
        <div className="update-banner">
          <p>有新版本可用。请先保存当前记录。</p>
          <button
            onClick={() => {
              if (
                !dirty ||
                window.confirm('当前记录尚未保存，是否放弃修改并更新？')
              )
                pwa.update();
            }}
          >
            更新并重新打开
          </button>
        </div>
      )}
      <main>
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {!loaded ? (
          <p>正在打开本地数据…</p>
        ) : (
          <>
            {page === 'record' &&
              (saved ? (
                <section>
                  <h1>记录已保存</h1>
                  <div className="record-card">
                    <RecordSummary record={saved} goals={snapshot.goals} />
                  </div>
                  <div className="stack">
                    <button onClick={() => setViewing(saved)}>查看记录</button>
                    <button onClick={() => edit(saved)}>编辑刚才记录</button>
                    <button
                      className="primary"
                      onClick={() => {
                        setSaved(undefined);
                        setEditing(undefined);
                        setFormKey((key) => key + 1);
                      }}
                    >
                      记录下一次跑步
                    </button>
                  </div>
                </section>
              ) : (
                <RecordPage
                  key={formKey}
                  repository={repository}
                  goals={snapshot.goals}
                  record={editing}
                  refresh={refresh}
                  onDirty={setDirty}
                  onSaved={(record) => {
                    setSaved(record);
                    setEditing(undefined);
                    void refresh().catch(() =>
                      setError('记录已保存，但列表刷新失败，请刷新页面。'),
                    );
                    window.scrollTo(0, 0);
                  }}
                />
              ))}
            {page === 'history' && (
              <HistoryPage
                records={snapshot.records}
                goals={snapshot.goals}
                onView={setViewing}
              />
            )}
            {page === 'data' && (
              <DataPage
                repository={repository}
                goals={snapshot.goals}
                refresh={refresh}
              />
            )}
          </>
        )}
      </main>
      <nav className="bottom-nav" aria-label="主要导航">
        {(
          [
            ['record', '记录'],
            ['history', '历史'],
            ['data', '数据'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            aria-current={page === value ? 'page' : undefined}
            className={page === value ? 'active' : ''}
            onClick={() => navigate(value)}
          >
            {label}
          </button>
        ))}
      </nav>
      {viewing && (
        <RecordDetail
          record={viewing}
          goals={snapshot.goals}
          onClose={() => setViewing(undefined)}
          onEdit={edit}
          onDelete={async (id) => {
            await repository.deleteRecord(id);
            if (saved?.record_id === id) setSaved(undefined);
            await refresh();
          }}
        />
      )}
    </>
  );
}
