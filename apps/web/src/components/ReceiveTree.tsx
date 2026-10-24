import { useState } from 'react';
import { Button, Notice } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { communityApi } from '@/lib/community';

/** F1 — Nhận cây từ chủ cũ bằng mã nhận cây (cây về vườn kèm toàn bộ ảnh, lộ trình, nhật ký). */
export function ReceiveTree({ onReceived }: { onReceived?: () => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await communityApi.acceptTransfer(code.trim());
      setCode('');
      onReceived?.();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mx-gutter mt-4 flex flex-col gap-2" aria-label="Nhận cây">
      <div className="flex gap-2">
        <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} placeholder="Mã nhận cây" aria-label="Mã nhận cây"
          className="min-h-touch min-w-0 flex-1 rounded-btn border border-line-strong bg-surface px-3 font-mono text-body uppercase" />
        <Button size="touch" block={false} onClick={submit} disabled={code.trim().length < 6 || busy}>Nhận cây</Button>
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
    </section>
  );
}
