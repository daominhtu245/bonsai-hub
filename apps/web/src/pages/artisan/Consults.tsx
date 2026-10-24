import { useCallback, useEffect, useState } from 'react';
import { Button, Notice, Segmented, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { expertApi, VERDICT_VI, type Consult, type Verdict } from '@/lib/expert';
import { PageHeader } from '../admin/kit';

type Tab = 'open' | 'mine' | 'answered';

function AnswerForm({ c, onDone }: { c: Consult; onDone: () => void }) {
  const [verdict, setVerdict] = useState<Verdict>('fix');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await expertApi.answer(c.id, { answer: text.trim(), verdict });
      onDone();
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <Segmented<Verdict> label="Đánh giá" value={verdict} onChange={setVerdict} options={Object.entries(VERDICT_VI) as Array<[Verdict, string]>} />
      <textarea rows={4} minLength={20} maxLength={4000} value={text} onChange={(e) => setText(e.target.value)} aria-label="Lời khuyên"
        placeholder="Lời khuyên cụ thể: cành nào giữ / cắt, uốn ra sao, thời điểm…" className="rounded-btn border border-line-strong bg-surface p-2 text-body" />
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button size="touch" block={false} onClick={submit} loading={busy} loadingLabel="Đang gửi…" disabled={text.trim().length < 20 || busy}>Gửi trả lời</Button>
    </div>
  );
}

/** D1 — Hỏi đáp (nghệ nhân): nhận câu hỏi, xem ảnh phôi + bản vẽ, trả lời. Quá 72 giờ hệ thống hoàn lượt cho người hỏi. */
export default function ArtisanConsults() {
  const [tab, setTab] = useState<Tab>('open');
  const [rows, setRows] = useState<Consult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => { setRows(null); expertApi.queue(tab).then(setRows).catch((e: ApiError) => setError(e.message)); }, [tab]);
  useEffect(load, [load]);
  const claim = (id: string) => expertApi.claim(id).then(load).catch((e: ApiError) => setError(e.message));
  return (
    <>
      <PageHeader title="Hỏi đáp" sub="Người chơi trả lượt để nhận góp ý thiết kế từ nghệ nhân" />
      <div className="mb-3 max-w-md"><Segmented<Tab> label="Danh sách" value={tab} onChange={setTab} options={[['open', 'Đang chờ'], ['mine', 'Tôi đã nhận'], ['answered', 'Đã trả lời']]} /></div>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {rows === null ? <Skeleton className="h-60 rounded-card" /> : rows.length === 0 ? <Notice tone="info">Không có câu hỏi.</Notice> : (
        <ul className="m-0 grid list-none gap-3 p-0 xl:grid-cols-2">
          {rows.map((c) => (
            <li key={c.id} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 shadow-card sm:flex-row">
              {c.sketch_url || c.photo_url ? <img src={c.sketch_url ?? c.photo_url!} alt="Bản vẽ thiết kế" className="w-full flex-none rounded-img bg-photo object-contain sm:w-48" /> : null}
              <div className="flex min-w-0 flex-1 flex-col gap-2 text-caption">
                <div className="text-ink-muted">{new Date(c.created_at).toLocaleString('vi-VN')}{c.style_vi ? ` · Thế ${c.style_vi}` : ''}</div>
                <p className="m-0 whitespace-pre-line text-body">{c.question}</p>
                {c.design_notes ? <p className="m-0 text-ink-muted">{c.design_notes}</p> : null}
                {c.status === 'answered' ? (
                  <div className={cx('rounded-btn bg-surface-2 p-2')}><b>{c.verdict_vi}</b> — {c.answer}{c.rating ? ` · ${c.rating}★` : ''}</div>
                ) : c.artisan ? <AnswerForm c={c} onDone={load} /> : (
                  <Button size="touch" block={false} variant="secondary" onClick={() => claim(c.id)}>Nhận câu hỏi</Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
