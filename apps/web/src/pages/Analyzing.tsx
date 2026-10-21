import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Button, ButtonLink, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { phaseAError, SPECIES_NAME, TIPS } from '@/lib/copy';
import { cx } from '@/lib/cx';
import { jobsApi, watchJob, type Job, type JobProgress } from '@/lib/jobs';

const STEP_KEYS = ['species', 'trunk', 'branches', 'front', 'design'] as const;
const EXPECTED_SECONDS = 35;

function stepLabel(key: (typeof STEP_KEYS)[number], progress: JobProgress, done: boolean) {
  const s = progress.steps?.[key];
  switch (key) {
    case 'species':
      if (done && typeof s?.key === 'string') {
        const pct = typeof s.confidence === 'number' ? Math.round(s.confidence * 100) : null;
        return (
          <>
            Nhận diện loài: <strong className="font-semibold">{SPECIES_NAME[s.key] ?? s.key}</strong>
            {pct !== null ? <span className="text-caption text-ink-muted"> (chắc chắn {pct}%)</span> : null}
          </>
        );
      }
      return 'Nhận diện loài';
    case 'trunk':
      return 'Đo độ thuôn thân và rễ nổi';
    case 'branches':
      return done && typeof s?.count === 'number' ? `Đã xét ${s.count} cành: giữ cành nào, cắt cành nào` : 'Xét từng cành: giữ cành nào, cắt cành nào';
    case 'front':
      return 'Chọn mặt tiền đẹp nhất';
    case 'design':
      return 'Đề xuất thế cây và vẽ bản thiết kế';
  }
}

function StepIcon({ state }: { state: 'done' | 'current' | 'pending' }) {
  if (state === 'done')
    return (
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full bg-leaf" aria-hidden="true">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--surface)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l4 4 10-10" /></svg>
      </span>
    );
  if (state === 'current')
    return (
      <span className="flex h-7 w-7 flex-none items-center justify-center rounded-full border-2 border-primary" aria-hidden="true">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-primary" />
      </span>
    );
  return <span className="h-7 w-7 flex-none rounded-full border-[1.5px] border-line-strong" aria-hidden="true" />;
}

/** Màn 04 — Đang phân tích (design/mockups/Analyzing.dc.html). Tiến độ qua SSE. */
export default function Analyzing() {
  const { jobId = '' } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tip, setTip] = useState(() => Math.floor(Math.random() * TIPS.length));
  const [elapsed, setElapsed] = useState(0);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let stop = () => {};
    setJob(null);
    setError(null);
    jobsApi
      .get(jobId)
      .then((j) => {
        setJob(j);
        if (j.status === 'awaiting_choice') return navigate(`/chon/${j.id}`, { replace: true });
        if (j.status === 'failed') return;
        stop = watchJob(
          jobId,
          (ev) => {
            if (ev.status === 'awaiting_choice') navigate(`/chon/${jobId}`, { replace: true });
            else if (ev.status === 'failed') jobsApi.get(jobId).then(setJob).catch(() => setJob((p) => (p ? { ...p, ...ev } : p)));
            else setJob((p) => (p ? { ...p, ...ev } : p));
          },
          (e) => setError(e.message),
        );
      })
      .catch((e: ApiError) => setError(e.message));
    return () => stop();
  }, [jobId, navigate]);

  useEffect(() => {
    const t = window.setInterval(() => setTip((i) => (i + 1) % TIPS.length), 8000);
    const e = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => {
      window.clearInterval(t);
      window.clearInterval(e);
    };
  }, []);

  const steps = useMemo(() => {
    const progress = job?.progress ?? {};
    let currentSet = false;
    return STEP_KEYS.map((key) => {
      const done = progress.steps?.[key]?.state === 'done';
      let state: 'done' | 'current' | 'pending' = done ? 'done' : 'pending';
      if (!done && !currentSet && job && job.status !== 'failed') {
        state = 'current';
        currentSet = true;
      }
      return { key, state, label: stepLabel(key, progress, done) };
    });
  }, [job]);

  const retry = async () => {
    if (!job) return;
    setRetrying(true);
    try {
      const next = await jobsApi.createJob(job.tree_id);
      navigate(`/phan-tich/${next.id}`, { replace: true });
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setRetrying(false);
    }
  };

  const doneCount = steps.filter((s) => s.state === 'done').length;
  const pct = Math.max(5, Math.round((doneCount / STEP_KEYS.length) * 100));
  const remaining = Math.max(5, EXPECTED_SECONDS - elapsed);
  const failed = job?.status === 'failed' ? phaseAError(job.error_code, job.analysis?.issues) : null;

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/" title={failed ? 'Chưa phân tích được' : 'Đang đọc phôi của bạn'} />

      <div className="relative mx-gutter mt-1 aspect-[300/260] overflow-hidden rounded-card border border-line bg-photo">
        {job?.front_photo ? (
          <>
            <img src={job.front_photo.url} alt="Ảnh phôi đang được đo thân và cành" className="h-full w-full object-contain" />
            {!failed ? <div aria-hidden="true" className="scan-line pointer-events-none absolute inset-x-0 h-1/4" /> : null}
          </>
        ) : (
          <Skeleton className="h-full w-full rounded-none" />
        )}
      </div>

      {error ? (
        <div className="px-gutter pt-5">
          <Notice tone="danger" action={<Button variant="secondary" size="touch" block={false} onClick={() => location.reload()}>Tải lại</Button>}>
            {error}
          </Notice>
        </div>
      ) : failed ? (
        <div className="flex flex-col gap-3 px-gutter pt-5">
          <Notice tone={failed.recapture ? 'warn' : 'danger'}>
            <strong className="font-semibold">{failed.title}.</strong> {failed.body}
          </Notice>
          {failed.recapture ? (
            <ButtonLink to="/chup">Chụp lại</ButtonLink>
          ) : (
            <Button loading={retrying} onClick={retry}>
              Thử lại
            </Button>
          )}
        </div>
      ) : (
        <>
          <ol className="mx-gutter mt-5 flex list-none flex-col gap-1 p-0" aria-live="polite">
            {steps.map((s) => (
              <li key={s.key} className={cx('flex min-h-touch items-center gap-3', s.state === 'pending' && 'text-ink-muted', s.state === 'current' && 'font-semibold')}>
                <StepIcon state={s.state} />
                <span>{s.label}</span>
              </li>
            ))}
          </ol>

          <div className="mx-gutter mt-4 flex gap-3 rounded-card border border-line bg-surface px-4 py-3.5">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--clay)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="mt-0.5 flex-none"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z" /></svg>
            <div>
              <div className="text-caption font-semibold text-clay">Mẹo nhỏ</div>
              <div className="text-caption">{TIPS[tip]}</div>
            </div>
          </div>
        </>
      )}

      {!failed && !error ? (
        <div className="mt-auto flex flex-col items-center gap-1.5 px-gutter pb-7 pt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Tiến độ phân tích" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-primary transition-[width] duration-base ease-calm" style={{ width: `${pct}%` }} />
          </div>
          <span className="text-center text-caption text-ink-muted">
            Còn khoảng {remaining} giây · phân tích miễn phí, chưa trừ lượt
          </span>
        </div>
      ) : null}
    </div>
  );
}
