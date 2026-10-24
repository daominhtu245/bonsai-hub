import { useEffect, useState } from 'react';
import { ChevronRight, Star, Users } from 'lucide-react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Avatar } from '@/components/Avatar';
import { BackHeader } from '@/components/BackHeader';
import { TreePicker } from '@/components/TreePicker';
import { Button, ButtonLink, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { expertApi, type Consult, type Person } from '@/lib/expert';

const TEMPLATES = ['Thế này đã hợp chưa?', 'Cành nào nên cắt bỏ?', 'Nên uốn cành nào trước?', 'Có nên hạ ngọn không?', 'Chậu này hợp không?'];
const STATUS_VI = { open: 'Chờ trả lời', answered: 'Đã trả lời', refunded: 'Đã hoàn lượt' } as const;
const day = (iso: string) => new Date(iso).toLocaleDateString('vi-VN');

/** D1 — Gửi câu hỏi: chọn cây (hoặc từ màn Kết quả), chọn nghệ nhân (không bắt buộc), trả lượt. */
export function AskConsultPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [jobId, setJobId] = useState<string | null>(params.get('job'));
  const [treeId, setTreeId] = useState<string | null>(null);
  const [artisan, setArtisan] = useState(params.get('nghe-nhan') ?? '');
  const [artisans, setArtisans] = useState<Person[]>([]);
  const [price, setPrice] = useState<{ credits: number; answer_within_hours: number } | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    expertApi.artisans().then(setArtisans).catch(() => null);
    expertApi.price().then(setPrice).catch(() => null);
  }, []);
  const submit = async () => {
    if (!jobId) return;
    setBusy(true);
    setError(null);
    try {
      const c = await expertApi.ask(jobId, { question: q.trim(), artisan_slug: artisan || undefined });
      navigate(`/hoi-nghe-nhan/${c.id}`, { replace: true });
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/nghe-nhan" title="Hỏi nghệ nhân" />
      <div className="flex flex-col gap-4 px-gutter py-3">
        {params.get('job') ? null : (
          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-caption font-semibold">Cây cần góp ý</h2>
            <TreePicker value={treeId} onChange={(t) => { setTreeId(t.tree_id); setJobId(t.job_id); }} />
          </section>
        )}
        {artisans.length ? (
          <section className="flex flex-col gap-2">
            <h2 className="m-0 text-caption font-semibold">Nghệ nhân</h2>
            <div role="radiogroup" aria-label="Nghệ nhân" className="-mx-gutter flex gap-2 overflow-x-auto px-gutter pb-1">
              {[{ slug: '', name: 'Ai rảnh trước' } as Pick<Person, 'slug' | 'name'>, ...artisans].map((a) => (
                <button key={a.slug || 'any'} type="button" role="radio" aria-checked={artisan === a.slug} onClick={() => setArtisan(a.slug)}
                  className={cx('flex w-24 flex-none flex-col items-center gap-1.5 rounded-card border p-2 text-label', artisan === a.slug ? 'border-ink bg-surface-2 font-semibold' : 'border-line bg-surface')}>
                  {a.slug ? <Avatar name={a.name} /> : <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-2 text-ink-muted"><Users size={20} aria-hidden="true" /></span>}
                  <span className="line-clamp-2 text-center leading-tight">{a.name}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}
        <label className="flex flex-col gap-1 text-caption font-semibold">Câu hỏi
          <textarea rows={4} minLength={10} maxLength={2000} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Viết câu hỏi hoặc chọn gợi ý bên dưới"
            className="rounded-btn border border-line-strong bg-surface p-3 text-body font-normal" />
        </label>
        <div className="flex flex-wrap gap-1.5" aria-label="Câu hỏi gợi ý">
          {TEMPLATES.map((t) => (
            <button key={t} type="button" onClick={() => setQ((cur) => (cur.trim() ? `${cur.trim()} ${t}` : t))}
              className="min-h-touch rounded-full border border-line bg-surface px-3 text-label text-ink hover:bg-surface-2">+ {t}</button>
          ))}
        </div>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button onClick={submit} loading={busy} loadingLabel="Đang gửi…" disabled={!jobId || q.trim().length < 10 || busy}>
          Gửi câu hỏi{price ? ` · ${price.credits} lượt` : ''}
        </Button>
        {price ? <p className="m-0 text-center text-label text-ink-subtle">Không có trả lời trong {price.answer_within_hours / 24} ngày: tự hoàn lượt</p> : null}
      </div>
    </div>
  );
}

export function MyConsultsPage() {
  const [rows, setRows] = useState<Consult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { expertApi.mine().then(setRows).catch((e: ApiError) => setError(e.message)); }, []);
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/nghe-nhan" title="Câu hỏi của tôi" />
      <div className="flex flex-col gap-3 px-gutter py-3">
        <ButtonLink to="/hoi-nghe-nhan/moi">Đặt câu hỏi mới</ButtonLink>
        {error ? <Notice tone="danger">{error}</Notice> : rows === null ? <Skeleton className="h-40 rounded-card" /> : rows.length === 0 ? null : (
          <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-card border border-line bg-surface p-0 shadow-card">
            {rows.map((c) => (
              <li key={c.id}>
                <Link to={`/hoi-nghe-nhan/${c.id}`} className="flex min-h-[64px] items-center gap-3 px-4 py-3 text-ink no-underline hover:bg-surface-2">
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-body">{c.question}</span>
                    <span className="text-caption text-ink-muted">{day(c.created_at)} · {STATUS_VI[c.status]}{c.artisan ? ` · ${c.artisan}` : ''}</span>
                  </span>
                  <ChevronRight size={18} className="text-ink-subtle" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ConsultDetailPage() {
  const { consultId = '' } = useParams();
  const [c, setC] = useState<Consult | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { expertApi.get(consultId).then(setC).catch((e: ApiError) => setError(e.message)); }, [consultId]);
  const rate = (n: number) => c && expertApi.rate(c.id, n).then(() => setC({ ...c, rating: n })).catch((e: ApiError) => setError(e.message));
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/hoi-nghe-nhan" title="Hỏi nghệ nhân" />
      <div className="flex flex-col gap-4 px-gutter py-3">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {!c ? (error ? null : <Skeleton className="h-60 rounded-card" />) : (
          <>
            {c.sketch_url || c.photo_url ? <img src={c.sketch_url ?? c.photo_url!} alt="Bản vẽ thiết kế" className="max-h-80 w-full rounded-card border border-line bg-photo object-contain" /> : null}
            <section className="rounded-card border border-line bg-surface p-4 shadow-card">
              <div className="text-label text-ink-muted">Bạn hỏi · {day(c.created_at)}</div>
              <p className="m-0 mt-1 whitespace-pre-line">{c.question}</p>
            </section>
            {c.status === 'answered' ? (
              <section className="rounded-card border border-line bg-surface p-4 shadow-card">
                <div className="text-label text-ink-muted">{c.artisan} trả lời</div>
                <div className="mt-1 font-semibold">{c.verdict_vi}</div>
                <p className="m-0 mt-1 whitespace-pre-line">{c.answer}</p>
                <div className="mt-3 flex items-center gap-1" role="group" aria-label="Chấm câu trả lời">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} type="button" aria-label={`${n} sao`} aria-pressed={(c.rating ?? 0) >= n} onClick={() => rate(n)}
                      className={cx('flex h-touch w-touch items-center justify-center', (c.rating ?? 0) >= n ? 'text-brass' : 'text-ink-subtle')}>
                      <Star size={22} fill={(c.rating ?? 0) >= n ? 'currentColor' : 'none'} aria-hidden="true" />
                    </button>
                  ))}
                </div>
              </section>
            ) : <Notice tone={c.status === 'refunded' ? 'warn' : 'info'}>{STATUS_VI[c.status]}</Notice>}
          </>
        )}
      </div>
    </div>
  );
}
