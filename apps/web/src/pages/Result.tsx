import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
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
    <div className="relative mx-gutter mt-1 overflow-hidden rounded-card border border-line bg-photo" style={{ aspectRatio: ratio }}>
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
      <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
        <span className="rounded-full bg-surface px-2.5 py-1 text-label font-semibold text-ink">
          {stage.code} · {stage.time_from_start ?? ''}
        </span>
        {stage.code !== 'S0' ? <span className="rounded-full bg-surface px-2.5 py-1 text-label text-ink-muted">{sketch ? 'Bản vẽ' : 'Minh họa'}</span> : null}
        {stage.code === 'S4' && result.low_confidence ? (
          <span className="rounded-full bg-warn-soft px-2.5 py-1 text-label font-semibold text-warn-ink">Độ tin cậy thấp</span>
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
  return (
    <section className="mx-gutter mt-5 flex flex-col gap-2 rounded-card border border-line bg-surface px-4 py-3.5" aria-labelledby="fb-title">
      <span id="fb-title" className="font-semibold">Bản thiết kế này có hợp lý không?</span>
      <div className="flex gap-2">
        {([[1, 'Hợp lý'], [-1, 'Chưa đúng']] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={rating === value}
            onClick={() => send(value)}
            className={cx(
              'min-h-touch flex-1 rounded-btn border text-caption',
              rating === value ? 'border-primary bg-primary-soft font-semibold text-primary-ink' : 'border-line-strong bg-surface text-ink',
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {error ? <span className="text-label text-danger">{error}</span> : null}
      <span className="text-label text-ink-muted">{rating ? 'Cảm ơn bạn đã góp ý.' : 'Góp ý của bạn giúp nghệ nhân cố vấn chỉnh lại bộ luật.'}</span>
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
      <Button variant="danger" size="touch" onClick={remove}>Xóa cây này</Button>
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
      {stage.fallback_sketch ? (
        <p className="mx-gutter mt-2 text-caption text-ink-muted">Ảnh giai đoạn này chưa tạo được đủ tin cậy; bạn xem theo bản vẽ thiết kế.</p>
      ) : null}
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
        <details className="mx-gutter mt-4 rounded-card border border-line bg-surface px-4 py-1 text-caption">
          <summary className="flex min-h-touch cursor-pointer items-center font-semibold">Nhận xét tổng quan</summary>
          <div className="flex flex-col gap-2 pb-3">
            <p className="m-0">{r.material_review_vi}</p>
            {r.style_reason_vi ? <p className="m-0">{r.style_reason_vi}</p> : null}
            {r.species_care_vi?.length ? (
              <ul className="m-0 flex flex-col gap-1 pl-5">
                {r.species_care_vi.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            ) : null}
          </div>
        </details>
      ) : null}

      <section className="mx-gutter mt-5 grid grid-cols-2 gap-2.5">
        <ButtonLink to={`/chia-se/${result.job_id}`}>Chia sẻ ảnh</ButtonLink>
        <ButtonLink to="/vuon" variant="secondary">Lưu vào vườn</ButtonLink>
      </section>
      <div className="mx-gutter mt-2.5">
        <Link to={`/chon/${result.job_id}`} className="flex min-h-touch items-center justify-center text-caption">Xem lại bản vẽ cắt tỉa</Link>
      </div>

      <Feedback jobId={result.job_id} initial={result.my_rating} />
      <DeleteTree treeId={result.tree_id} />

      <footer className="mt-auto px-gutter pb-7 pt-5 text-label text-ink-muted">{result.disclaimer_vi}</footer>
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
        <header className="flex items-center gap-2 px-gutter py-3">
          <Link to="/vuon" aria-label="Về vườn của tôi" className="flex h-touch w-touch items-center justify-center rounded-btn text-ink hover:text-ink">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </Link>
          <div className="flex min-w-0 flex-col leading-tight">
            <h1 className="truncate font-body text-body font-semibold">{title}</h1>
            {result.style_vi ? (
              <span className="text-label text-ink-muted">
                <StyleName vi={result.style_vi} jp={result.style_jp} />
              </span>
            ) : null}
          </div>
          <Link to={`/chia-se/${result.job_id}`} aria-label="Chia sẻ" className="ml-auto flex h-touch w-touch flex-none items-center justify-center rounded-btn border border-line bg-surface text-ink">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 15V3m0 0L8 7m4-4 4 4M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7" /></svg>
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
          <div className="relative aspect-[3/4] overflow-hidden rounded-card border border-line bg-photo">
            {job.front_photo ? <img src={job.front_photo.url} alt="Ảnh phôi gốc" className="h-full w-full object-contain opacity-60" /> : null}
            <div aria-hidden="true" className="scan-line pointer-events-none absolute inset-x-0 h-1/4" />
          </div>
          <StepList steps={steps} />
          <p className="m-0 text-center text-caption text-ink-muted">Khoảng 3–5 phút. Nếu có lỗi, lượt sẽ được hoàn tự động.</p>
        </main>
      )}
    </div>
  );
}
