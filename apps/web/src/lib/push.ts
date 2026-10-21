import { ApiError, api } from './api';

export type PushState = 'unsupported' | 'ios-needs-install' | 'disabled' | 'denied' | 'off' | 'on';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

let config: Promise<{ enabled: boolean; public_key: string | null }> | null = null;
const getConfig = () => (config ??= api<{ enabled: boolean; public_key: string | null }>('/push/config'));

/** Trạng thái thông báo trên thiết bị này. iPhone chỉ nhận Web Push khi đã "Thêm vào Màn hình chính". */
export async function pushState(): Promise<PushState> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return isIOS() && !isStandalone() ? 'ios-needs-install' : 'unsupported';
  }
  try {
    if (!(await getConfig()).enabled) return 'disabled';
  } catch {
    return 'disabled';
  }
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? 'on' : 'off';
}

export async function enablePush(): Promise<PushState> {
  const cfg = await getConfig();
  if (!cfg.enabled || !cfg.public_key) return 'disabled';
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off';
  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(cfg.public_key) }));
  const json = sub.toJSON();
  await api('/push/subscriptions', { method: 'POST', json: { endpoint: json.endpoint, keys: json.keys } });
  return 'on';
}

export async function disablePush(): Promise<PushState> {
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (sub) {
    await api('/push/subscriptions', { method: 'DELETE', json: { endpoint: sub.endpoint } }).catch((e: ApiError) => {
      if (e.status !== 401) throw e;
    });
    await sub.unsubscribe();
  }
  return 'off';
}
