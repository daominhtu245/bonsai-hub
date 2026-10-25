import { useState } from 'react';
import { ChevronDown, QrCode } from 'lucide-react';
import { Button, IconBadge, Notice } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { communityApi } from '@/lib/community';
import { cx } from '@/lib/cx';

/** F1 — Nhận cây từ chủ cũ bằng mã nhận cây (cây về vườn kèm toàn bộ ảnh, lộ trình, nhật ký). Thu gọn thành một dòng. */
export function ReceiveTree({ onReceived }: { onReceived?: () => void }) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await communityApi.acceptTransfer(code.trim());
      setCode('');
      setOpen(false);
      onReceived?.();
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card" aria-label="Nhận cây">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex min-h-[56px] w-full items-center gap-3 px-3 text-left">
        <IconBadge Icon={QrCode} tone="clay" size="sm" />
        <span className="flex-1 text-caption font-medium">Nhận cây được chuyển cho bạn</span>
        <ChevronDown size={18} className={cx('text-ink-subtle transition-transform duration-fast', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open ? (
        <div className="flex flex-col gap-2 border-t border-line p-3">
          <div className="flex gap-2">
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} placeholder="Mã nhận cây" aria-label="Mã nhận cây" autoFocus
              className="min-h-touch min-w-0 flex-1 rounded-btn border border-line-strong bg-surface px-3 font-mono text-body uppercase" />
            <Button size="touch" block={false} onClick={submit} disabled={code.trim().length < 6 || busy}>Nhận cây</Button>
          </div>
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </div>
      ) : null}
    </section>
  );
}
