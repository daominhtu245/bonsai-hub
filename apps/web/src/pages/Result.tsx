import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, Share2, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { NotifyPrompt } from '@/components/NotifyPrompt';
import {
  Button, ButtonLink, GuideCard, Notice, Skeleton, StageTimeline, StepList, StyleName, type StageGuide, type StepState,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cx } from '@/lib/cx';
import { accountApi } from '@/lib/account';
import { jobsApi, resultApi, watchJob, type Job, type ResultView, type StageView } from '@/lib/jobs';

const PHASE_B_STEPS: Array<[string, string]> = [
  ['render', 'Vẽ 3 phương án ảnh cây sau khi hoàn thiện'],
  ['judge', 'Chấm ảnh: giữ đúng thân, gốc và nền'],
  ['plan', 'Lập lộ trình từng giai đoạn'],
  ['S1', 'Vẽ giai đoạn tạo khung'],
  ['S2', 'Vẽ giai đoạn nuôi cành'],
  ['S3', 'Vẽ giai đoạn định tầng tán'],
  ['guide', 'Viết hướng dẫn chăm từng giai đoạn'],
];

function phaseBSteps(job: Job) {
  const steps = job.progress.steps ?? {};
  const list = PHASE_B_STEPS.map(([key, label]) => ({ key, label, done: steps[key]?.state === 'done' }));
  const repair = steps.repair;
  if (repair) {
    const round = typeof repair.round === 'number' ? repair.round : typeof repair.rounds === 'number' ? repair.rounds : 1;
    list.splice(2, 0, { key: 'repair', label: `Vẽ lại ảnh chưa đạt (lần ${round})`, done: repair.state === 'done' });
  }
  let current = false;
  return list.map((s) => {
    let state: StepState = s.done ? 'done' : 'pending';
    if (!s.done && !current) {
      state = 'current';
      current = true;
    }
    return { key: s.key, state, label: s.label };
  });
}

function toGuide(s: StageView): StageGuide | null {
  if (!s.guide) return null;
  return {
    code: s.code,
    name: s.name_vi,
    time: s.time_from_start ?? '',
    see: s.guide.see_vi,
    actions: s.guide.actions_vi,
    season: s.guide.best_time_vi,
    ready: s.guide.ready_signs_vi,
    mistake: s.guide.common_mistakes_vi.join(' '),
    care: s.guide.care_vi,
  };
}

function StageImage({ result, stage }: { result: ResultView; stage: StageView }) {
  const photo = result.front_photo;
  const ratio = photo?.width && photo?.height ? `${photo.width} / ${photo.height}` : '3 / 4';
  const sketch = stage.fallback_sketch || !stage.image_url;
  const src = sketch ? photo?.url : stage.image_url;
  return (
    <div className="relative mx-gutter mt-4 overflow-hidden rounded-card border border-line bg-photo shadow-card" style={{ aspectRatio: ratio }}>
      {src ? (
        <img
          key={stage.code}
          src={src}
          alt={stage.code === 'S0' ? 'Phôi hiện tại' : `Minh họa giai đoạn ${stage.code}: ${stage.name_vi}`}
          className="stage-fade absolute inset-0 h-full w-full"
        />
      ) : null}
      {sketch && stage.code !== 'S0' && result.sketch_svg_url ? (
        <img src={result.sketch_svg_url} alt="Bản vẽ thiết kế thay cho ảnh giai đoạn này" className="absolute inset-0 h-full w-full" />
      ) : null}
      <div className="theme-light absolute left-2.5 top-2.5 flex flex-wrap gap-1">
        <span className="tabular rounded-chip bg-surface px-2 py-0.5 text-label font-semibold text-ink shadow-raised">
          {stage.code} · {stage.time_from_start ?? ''}
        </span>
        {stage.code !== 'S0' ? <span className="rounded-chip bg-surface px-2 py-0.5 text-label font-medium text-ink-muted shadow-raised">{sketch ? 'Bản vẽ' : 'Minh họa'}</span> : null}
        {stage.code === 'S4' && result.low_confidence ? (
          <span className="rounded-chip bg-warn-soft px-2 py-0.5 text-label font-semibold text-warn-ink shadow-raised">Độ tin cậy thấp</span>
        ) : null}
      </div>
    </div>
  );
}

function Feedback({ jobId, initial }: { jobId: string; initial: 1 | -1 | null }) {
  const [rating, setRating] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const send = (r: 1 | -1) => {
    const prev = rating;
    setRating(r);
    setError(null);
    resultApi.feedback(jobId, r).catch((e: ApiError) => {
      setRating(prev);
      setError(e.message);
    });
  };
  const opts = [
    [1, 'Hợp lý', ThumbsUp],
    [-1, 'Chưa đúng', ThumbsDown],
  ] as const;
  return (
    <section className="mx-gutter mt-4 flex flex-wrap items-center gap-2 rounded-card border border-line bg-surface px-4 py-3 shadow-card" aria-labelledby="fb-title">
      <span id="fb-title" className="min-w-[10rem] flex-1 text-caption font-medium">Bản thiết kế này có hợp lý không?</span>
      <div className="flex flex-wrap gap-2">
        {opts.map(([value, label, Icon]) => (
          <button key={value} type="button" aria-pressed={rating === value} onClick={() => send(value)}
            className={cx('inline-flex min-h-touch items-center gap-1.5 rounded-btn border px-3 text-caption font-medium',
              rating === value ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-muted hover:text-ink')}>
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      {error ? <span className="w-full text-label text-danger">{error}</span> : null}
    </section>
  );
}

function DeleteTree({ treeId }: { treeId: string }) {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const remove = async () => {
    if (!window.confirm('Xóa cây này cùng toàn bộ ảnh, bản vẽ và lộ trình? Không khôi phục được.')) return;
    try {
      await accountApi.deleteTree(treeId);
      navigate('/vuon', { replace: true });
    } catch (e) {
      setError((e as ApiError).message);
    }
  };
  return (
    <div className="mx-gutter mt-3 flex flex-col gap-2">
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Button variant="danger" size="touch" onClick={remove}>
        <Trash2 size={16} strokeWidth={1.75} aria-hidden="true" />
        Xóa cây này
      </Button>
    </div>
  );
}

function Done({ result, onToggle }: { result: ResultView; onToggle: (code: string, idx: number) => void }) {
  const [index, setIndex] = useState(4);
  const stage = result.stages[index];
  const guide = toGuide(stage);
  const tabs = result.stages.map((s) => ({ code: s.code, short: s.short_vi }));
  const r = result.report;

  return (
    <>
      <StageImage result={result} stage={stage} />
      {stage.fallback_sketch ? <p className="mx-gutter mt-2 text-label text-ink-subtle">Giai đoạn này hiển thị bản vẽ thay ảnh.</p> : null}
      <div className="mx-gutter mt-4">
        <StageTimeline stages={tabs} current={index} onSelect={setIndex} />
      </div>
      <div className="mx-gutter mt-5">
        {guide ? (
          <GuideCard guide={guide} done={new Set(stage.done_tasks)} onToggle={(i) => onToggle(stage.code, i)} />
        ) : (
          <Notice tone="warn">Chưa có hướng dẫn cho giai đoạn này.</Notice>
        )}
      </div>

      {r?.material_review_vi ? (
        <details className="group mx-gutter mt-4 rounded-card border border-line bg-surface px-4 py-1 text-caption shadow-card">
          <summary className="flex min-h-touch cursor-pointer list-none items-center gap-1.5 font-medium [&::-webkit-details-marker]:hidden">
            <ChevronDown size={16} className="text-ink-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
            Nhận xét tổng quan
          </summary>
          <div className="flex flex-col gap-2 pb-3">
            <p className="m-0">{r.material_review_vi}</p>
            {r.style_reason_vi ? <p className="m-0">{r.style_reason_vi}</p> : null}
            {r.species_care_vi?.length ? (
              <ul className="m-0 flex flex-col gap-1 pl-5 list-disc">
                {r.species_care_vi.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            ) : null}
          </div>
        </details>
      ) : null}

      <section className="mx-gutter mt-4 grid grid-cols-2 gap-2">
        <ButtonLink to={`/chia-se/${result.job_id}`}>
          <Share2 size={18} strokeWidth={1.75} aria-hidden="true" />
          Chia sẻ ảnh
        </ButtonLink>
        <ButtonLink to={`/chon/${result.job_id}`} variant="secondary">Bản vẽ cắt tỉa</ButtonLink>
      </section>

      <Feedback jobId={result.job_id} initial={result.my_rating} />
      <DeleteTree treeId={result.tree_id} />

      <footer className="mt-auto px-gutter pb-6 pt-5 text-label text-ink-subtle">{result.disclaimer_vi}</footer>
    </>
  );
}

/** Màn 06 — Kết quả + lộ trình (design/mockups/Result.dc.html). Khi phiên B còn chạy: hiển thị tiến độ. */
export default function Result() {
  const { jobId = '' } = useParams();
  const { refresh } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [result, setResult] = useState<ResultView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadResult = useCallback(() => {
    resultApi.get(jobId).then(setResult).catch((e: ApiError) => setError(e.message));
  }, [jobId]);

  useEffect(() => {
    let stop = () => {};
    jobsApi
      .get(jobId)
      .then((j) => {
        setJob(j);
        if (j.status === 'done') return loadResult();
        if (j.status === 'failed') return;
        stop = watchJob(
          jobId,
          (ev) => {
            if (ev.status === 'done') {
              setJob((p) => (p ? { ...p, ...ev } : p));
              loadResult();
            } else if (ev.status === 'failed') {
              jobsApi.get(jobId).then(setJob).catch((e: ApiError) => setError(e.message));
              refresh(); // lượt đã được hoàn
            } else setJob((p) => (p ? { ...p, ...ev } : p));
          },
          (e) => setError(e.message),
        );
      })
      .catch((e: ApiError) => setError(e.message));
    return () => stop();
  }, [jobId, loadResult, refresh]);

  const toggle = (code: string, idx: number) => {
    if (!result) return;
    const stage = result.stages.find((s) => s.code === code)!;
    const done = !stage.done_tasks.includes(idx);
    const apply = (on: boolean) =>
      setResult((r) =>
        r && {
          ...r,
          stages: r.stages.map((s) =>
            s.code === code ? { ...s, done_tasks: on ? [...s.done_tasks, idx] : s.done_tasks.filter((t) => t !== idx) } : s,
          ),
        },
      );
    apply(done);
    resultApi.toggleTask(jobId, code, idx, done).catch(() => apply(!done));
  };

  const steps = useMemo(() => (job ? phaseBSteps(job) : []), [job]);
  const title = result?.tree_nickname ?? job?.tree_nickname ?? 'Ảnh tương lai';

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      {result ? (
        <header className="sticky top-0 z-10 flex min-h-14 items-center gap-1 border-b border-line px-2 py-1" style={{ background: 'color-mix(in srgb, var(--bg) 88%, transparent)', backdropFilter: 'blur(8px)' }}>
          <Link to="/vuon" aria-label="Về vườn của tôi" className="flex h-touch w-touch flex-none items-center justify-center rounded-btn text-ink hover:bg-surface-2 hover:text-ink">
            <ChevronLeft size={22} strokeWidth={1.75} />
          </Link>
          <div className="flex min-w-0 flex-col leading-tight">
            <h1 className="text-[15px] font-semibold [overflow-wrap:anywhere]">{title}</h1>
            {result.style_vi ? (
              <span className="text-label text-ink-muted">
                <StyleName vi={result.style_vi} jp={result.style_jp} />
              </span>
            ) : null}
          </div>
          <Link to={`/chia-se/${result.job_id}`} aria-label="Chia sẻ" className="ml-auto flex h-touch w-touch flex-none items-center justify-center rounded-btn text-ink-muted hover:bg-surface-2 hover:text-ink">
            <Share2 size={20} strokeWidth={1.75} />
          </Link>
        </header>
      ) : (
        <BackHeader to="/" title={title} />
      )}

      {error ? (
        <div className="px-gutter">
          <Notice tone="danger" action={<Button variant="secondary" size="touch" block={false} onClick={() => location.reload()}>Tải lại</Button>}>{error}</Notice>
        </div>
      ) : result ? (
        <Done result={result} onToggle={toggle} />
      ) : !job || job.status === 'done' ? (
        <div className="flex flex-col gap-4 px-gutter pt-1" aria-busy="true">
          <Skeleton className="aspect-[3/4] rounded-card" />
          <Skeleton className="h-16 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
      ) : job.status === 'failed' ? (
        <main className="flex flex-col gap-4 px-gutter pt-2">
          <Notice tone="danger">Tạo ảnh chưa thành công. Đã hoàn lượt cho bạn.</Notice>
          <ButtonLink to={`/chon/${job.id}`} variant={job.can_retry ? 'primary' : 'secondary'}>
            {job.can_retry ? 'Chọn lại và thử lại' : 'Xem lại bản vẽ'}
          </ButtonLink>
        </main>
      ) : (
        <main className="flex flex-col gap-4 px-gutter pt-2">
          <div className="relative mt-2 aspect-[4/3] overflow-hidden rounded-card border border-line bg-photo shadow-card">
            {job.front_photo ? <img src={job.front_photo.url} alt="Ảnh phôi gốc" className="h-full w-full object-contain opacity-60" /> : null}
            <div aria-hidden="true" className="scan-line pointer-events-none absolute inset-x-0 h-1/4" />
          </div>
          <div className="rounded-card border border-line bg-surface p-4 shadow-card"><StepList steps={steps} /></div>
          <p className="tabular m-0 text-center text-label text-ink-subtle">Khoảng 3–5 phút</p>
          <NotifyPrompt />
        </main>
      )}
    </div>
  );
}
