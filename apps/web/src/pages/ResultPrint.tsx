import { useEffect, useState } from 'react';
import { ChevronLeft, Printer } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';
import { Button, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { resultApi, type ResultView } from '@/lib/jobs';

function List({ title, items }: { title: string; items?: string[] }) {
  if (!items?.length) return null;
  return (
    <div className="mt-2">
      <div className="font-semibold">{title}</div>
      <ul className="m-0 list-disc pl-5">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>
    </div>
  );
}

/** Bản in lộ trình chăm sóc (In / Lưu PDF từ trình duyệt): chữ to, mỗi giai đoạn một khối, có ô đánh dấu. */
export default function ResultPrint() {
  const { jobId = '' } = useParams();
  const [r, setR] = useState<ResultView | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    resultApi.get(jobId).then(setR).catch((e: ApiError) => setError(e.message));
  }, [jobId]);

  return (
    <div className="print-page theme-light mx-auto max-w-[820px] bg-surface px-6 py-6 text-[17px] leading-relaxed text-ink">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-2">
        <Link to={`/ket-qua/${jobId}`} className="inline-flex min-h-touch items-center gap-1 text-caption text-ink-muted no-underline"><ChevronLeft size={16} />Quay lại</Link>
        <Button size="touch" block={false} onClick={() => window.print()} disabled={!r}><Printer size={18} aria-hidden="true" />In / Lưu PDF</Button>
      </div>
      {error ? <Notice tone="danger">{error}</Notice> : !r ? <Skeleton className="h-96 rounded-card" /> : (
        <article>
          <header className="border-b border-line pb-3">
            <h1 className="m-0 text-[26px] font-semibold">Lộ trình chăm sóc — {r.tree_nickname || 'Cây của tôi'}</h1>
            <p className="m-0 mt-1 text-ink-muted">
              {[r.style_vi && `Thế ${r.style_vi}`, r.years && `khoảng ${r.years} năm`, `in ngày ${new Date().toLocaleDateString('vi-VN')}`].filter(Boolean).join(' · ')}
            </p>
          </header>
          <div className="mt-4 grid grid-cols-5 gap-2">
            {r.stages.map((s) => (
              <figure key={s.code} className="m-0">
                {s.image_url ? <img src={s.image_url} alt={s.name_vi} className="aspect-square w-full rounded-img border border-line object-cover" /> : <div className="aspect-square rounded-img border border-dashed border-line" />}
                <figcaption className="mt-1 text-center text-[13px] text-ink-muted">{s.short_vi}{s.time_from_start ? ` · ${s.time_from_start}` : ''}</figcaption>
              </figure>
            ))}
          </div>
          {r.report?.material_review_vi ? <p className="mt-4">{r.report.material_review_vi}</p> : null}
          {r.stages.filter((s) => s.guide).map((s) => (
            <section key={s.code} className="print-block mt-5 rounded-card border border-line p-4">
              <h2 className="m-0 text-[20px] font-semibold">{s.guide!.title_vi || s.name_vi}{s.time_from_start ? <span className="font-normal text-ink-muted"> — {s.time_from_start}</span> : null}</h2>
              {s.guide!.best_time_vi ? <p className="m-0 mt-1 text-ink-muted">Thời điểm tốt: {s.guide!.best_time_vi}</p> : null}
              {s.guide!.actions_vi.length ? (
                <div className="mt-2">
                  <div className="font-semibold">Việc cần làm</div>
                  <ul className="m-0 list-none p-0">
                    {s.guide!.actions_vi.map((a, i) => <li key={i} className="flex gap-2"><span aria-hidden="true">☐</span><span>{a}</span></li>)}
                  </ul>
                </div>
              ) : null}
              <List title="Chăm sóc" items={s.guide!.care_vi} />
              <List title="Sang giai đoạn sau khi" items={s.guide!.ready_signs_vi} />
              <List title="Tránh" items={s.guide!.common_mistakes_vi} />
            </section>
          ))}
          <footer className="mt-6 text-[13px] text-ink-muted">{r.disclaimer_vi} · Bonsai AI</footer>
        </article>
      )}
    </div>
  );
}
