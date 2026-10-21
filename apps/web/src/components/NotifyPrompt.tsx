import { useEffect, useState } from 'react';
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
    return <p className="m-0 text-center text-label text-ink-muted">Muốn được báo khi xong trên iPhone: bấm Chia sẻ › Thêm vào Màn hình chính, rồi mở app từ đó.</p>;
  if (state === 'on') return <p className="m-0 text-center text-label text-ink-muted" role="status">Sẽ báo cho bạn khi xong — bạn có thể rời app.</p>;
  if (state !== 'off') return null;
  return (
    <Button variant="secondary" size="touch" loading={busy} loadingLabel="Đang bật…" onClick={async () => {
      setBusy(true);
      setState(await enablePush().catch(() => 'off' as PushState));
      setBusy(false);
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Zm4 4h4" /></svg>
      Báo tôi khi xong
    </Button>
  );
}
