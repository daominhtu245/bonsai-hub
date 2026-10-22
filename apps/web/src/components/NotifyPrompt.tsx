import { useEffect, useState } from 'react';
import { Bell } from 'lucide-react';
import { enablePush, pushState, type PushState } from '@/lib/push';
import { Button } from './ui';

/** Lời mời "Báo tôi khi xong" ở màn chờ. Ẩn khi không hỗ trợ / đã bật / đã từ chối. */
export function NotifyPrompt() {
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    pushState().then(setState).catch(() => setState('unsupported'));
  }, []);

  if (state === 'ios-needs-install')
    return <p className="m-0 text-center text-label text-ink-subtle">Nhận thông báo trên iPhone: Chia sẻ › Thêm vào Màn hình chính.</p>;
  if (state === 'on') return <p className="m-0 text-center text-label text-ink-subtle" role="status">Sẽ báo khi xong.</p>;
  if (state !== 'off') return null;
  return (
    <Button variant="secondary" size="touch" loading={busy} loadingLabel="Đang bật…" onClick={async () => {
      setBusy(true);
      setState(await enablePush().catch(() => 'off' as PushState));
      setBusy(false);
    }}>
      <Bell size={18} strokeWidth={1.75} aria-hidden="true" />
      Báo tôi khi xong
    </Button>
  );
}
