import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Button, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { communityApi, type Passport } from '@/lib/community';

/** F1 + F7 — Sổ cây: mã QR treo chậu, công khai lịch sử, chuyển chủ khi bán, báo mất. */
export function TreePassport({ treeId }: { treeId: string }) {
  const [p, setP] = useState<Passport | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const run = (fn: () => Promise<Passport>) => { setError(null); fn().then(setP).catch((e: ApiError) => setError(e.message)); };
  const onOpen = () => p === undefined && run(() => communityApi.openPassport(treeId));
  const stolen = (on: boolean) => {
    if (on && !window.confirm('Báo cây này bị mất? Trang sổ cây sẽ hiện cảnh báo cho người quét mã.')) return;
    run(() => communityApi.patchPassport(treeId, { stolen: on }));
  };
  return (
    <details className="group mx-gutter mt-4 rounded-card border border-line bg-surface shadow-card" onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && onOpen()}>
      <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between px-4 text-body font-medium">
        Sổ cây (mã QR)<ChevronDown size={18} className="text-ink-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="flex flex-col gap-3 px-4 pb-4 text-caption">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {!p ? (error ? null : <Skeleton className="h-40" />) : (
          <>
            <div className="flex items-center gap-3">
              <img src={communityApi.qrUrl(p.code)} alt={`Mã QR sổ cây ${p.code}`} className="h-28 w-28 flex-none rounded-img border border-line bg-white" />
              <div className="flex min-w-0 flex-col gap-1">
                <span className="font-mono text-body font-semibold">{p.code}</span>
                <a href={p.url} target="_blank" rel="noreferrer" className="break-all text-label">{p.url}</a>
              </div>
            </div>
            <label className="flex min-h-touch items-center justify-between gap-3">
              <span>Công khai lịch sử cây</span>
              <input type="checkbox" role="switch" className="switch" checked={p.public} onChange={(e) => run(() => communityApi.patchPassport(treeId, { public: e.target.checked }))} />
            </label>
            {p.pending_transfer ? (
              <Notice tone="info" action={<Button variant="secondary" size="touch" block={false} onClick={() => run(() => communityApi.cancelTransfer(treeId))}>Hủy</Button>}>
                Mã nhận cây: <span className="font-mono font-semibold">{p.pending_transfer}</span> · hết hạn {new Date(p.transfer_expires_at!).toLocaleDateString('vi-VN')}
              </Notice>
            ) : (
              <Button variant="secondary" size="touch" disabled={p.stolen} onClick={() => run(() => communityApi.startTransfer(treeId))}>Chuyển cây cho chủ mới</Button>
            )}
            <Button variant={p.stolen ? 'secondary' : 'danger'} size="touch" onClick={() => stolen(!p.stolen)}>{p.stolen ? 'Đã tìm lại cây' : 'Báo mất cây'}</Button>
          </>
        )}
      </div>
    </details>
  );
}
