import { useEffect, useRef, useState } from 'react';
export function usePwa() {
  const [status, setStatus] = useState(
    import.meta.env.DEV ? '开发预览' : '正在准备离线资源…',
  );
  const [waiting, setWaiting] = useState(false);
  const worker = useRef<ServiceWorker | null>(null);
  const requestedUpdate = useRef(false);
  useEffect(() => {
    if (import.meta.env.DEV) return;
    if (!('serviceWorker' in navigator) || !window.isSecureContext) {
      setStatus('离线能力需要安全连接');
      return;
    }
    let alive = true;
    const change = () => {
      if (requestedUpdate.current) window.location.reload();
      else if (alive) {
        setStatus('离线可用');
        setWaiting(false);
      }
    };
    navigator.serviceWorker.addEventListener('controllerchange', change);
    const offerUpdate = (next: ServiceWorker) => {
      if (alive) {
        worker.current = next;
        setWaiting(true);
      }
    };
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
      })
      .then((registration) => {
        if (!alive) return;
        if (registration.waiting) offerUpdate(registration.waiting);
        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          installing?.addEventListener('statechange', () => {
            if (
              installing.state === 'installed' &&
              navigator.serviceWorker.controller
            )
              offerUpdate(installing);
            if (
              installing.state === 'redundant' &&
              alive &&
              !navigator.serviceWorker.controller
            )
              setStatus('离线资源准备失败，请联网刷新重试');
          });
        });
        void navigator.serviceWorker.ready.then(() => {
          if (alive) setStatus('离线可用');
        });
      })
      .catch(() => {
        if (alive) setStatus('离线资源准备失败，请联网刷新重试');
      });
    return () => {
      alive = false;
      navigator.serviceWorker.removeEventListener('controllerchange', change);
    };
  }, []);
  return {
    status,
    waiting,
    update: () => {
      requestedUpdate.current = true;
      worker.current?.postMessage({ type: 'ACTIVATE_UPDATE' });
    },
  };
}
