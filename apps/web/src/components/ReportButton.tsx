import { useEffect, useRef, useState } from 'react';
import { Flag } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button, Notice } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cx } from '@/lib/cx';

const REASONS: Array<[string, string]> = [
  ['scam', 'Nghi lừa đảo'], ['stolen', 'Cây bị trộm'], ['wrong_info', 'Sai thông tin, sai giá'], ['offensive', 'Phản cảm'], ['spam', 'Spam'], ['other', 'Khác'],
];

/** Nút "Báo vi phạm" nhỏ dưới tin đăng / trang công khai → hàng chờ quản trị (/admin/bao-cao). */
export function ReportButton({ kind, target }: { kind: 'listing' | 'profile'; target: string }) {
  const { user } = useAuth();
  const ref = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const d = ref.current;
    if (!open || !d) return;
    if (typeof d.showModal === 'function') d.showModal();
    else d.setAttribute('open', '');
  }, [open]);
  const close = () => { ref.current?.close?.(); setOpen(false); };
  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api('/reports', { method: 'POST', json: { target_kind: kind, target, reason, note: note.trim() || undefined } });
      setDone(true);
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  if (done) return <span className="inline-flex min-h-touch items-center gap-1 text-caption text-ink-muted" role="status"><Flag size={14} aria-hidden="true" />Đã gửi báo cáo, cảm ơn bạn.</span>;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex min-h-touch items-center gap-1 self-start text-caption text-ink-muted hover:text-danger">
        <Flag size={14} aria-hidden="true" />Báo vi phạm
      </button>
      {open ? (
        <dialog ref={ref} onCancel={(e) => { e.preventDefault(); close(); }} aria-labelledby="report-title"
          className="w-[min(92vw,420px)] rounded-card border border-line bg-surface p-0 text-ink shadow-raised backdrop:bg-[var(--ink)] backdrop:opacity-40">
          <div className="flex flex-col gap-3 p-5">
            <h2 id="report-title" className="m-0 text-h2">Báo vi phạm</h2>
            {user.status !== 'ready' ? (
              <p className="m-0 text-caption">Cần <Link to="/dang-nhap">đăng nhập</Link> để báo.</p>
            ) : (
              <>
                <div role="radiogroup" aria-label="Lý do" className="flex flex-wrap gap-2">
                  {REASONS.map(([k, label]) => (
                    <button key={k} type="button" role="radio" aria-checked={reason === k} onClick={() => setReason(k)}
                      className={cx('min-h-touch rounded-full border px-3.5 text-caption font-medium', reason === k ? 'border-danger bg-danger-soft text-danger' : 'border-line text-ink-muted')}>
                      {label}
                    </button>
                  ))}
                </div>
                <textarea rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Thêm chi tiết (không bắt buộc)" aria-label="Chi tiết"
                  className="rounded-btn border border-line-strong bg-surface p-2 text-body" />
                {error ? <Notice tone="danger">{error}</Notice> : null}
              </>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" size="touch" block={false} onClick={close}>Đóng</Button>
              {user.status === 'ready' ? <Button size="touch" block={false} disabled={!reason || busy} onClick={send}>Gửi báo cáo</Button> : null}
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );
}
