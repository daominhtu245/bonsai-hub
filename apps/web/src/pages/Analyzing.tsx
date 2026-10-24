import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { NotifyPrompt } from '@/components/NotifyPrompt';
import { Button, ButtonLink, Notice, Skeleton, StepList, type StepState } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { phaseAError, SPECIES_NAME } from '@/lib/copy';
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
            Loài: <strong className="font-semibold">{SPECIES_NAME[s.key] ?? s.key}</strong>
            {pct !== null ? <span className="tabular text-ink-subtle"> · {pct}%</span> : null}
          </>
        );
      }
      return 'Nhận diện loài';
    case 'trunk':
      return 'Đo thân và rễ';
    case 'branches':
      return done && typeof s?.count === 'number' ? `Xét ${s.count} cành` : 'Xét các cành';
    case 'front':
      return 'Đánh giá mặt tiền';
    case 'design':
      return 'Đề xuất thế và vẽ bản thiết kế';
  }
}

/** Màn 04 — Đang phân tích (design/mockups/Analyzing.dc.html). Tiến độ qua SSE. */
export default function Analyzing() {
  const { jobId = '' } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  // Worker tách nền xong (progress.cutout) → tải lại phiên để lấy URL ký sẵn của ảnh đã tách.
  const hasCutout = Boolean((job?.progress as Record<string, unknown> | undefined)?.cutout);
  const needCutout = hasCutout && !job?.cutout_url;
  useEffect(() => {
    if (needCutout) jobsApi.get(jobId).then((j) => setJob((p) => (p ? { ...p, cutout_url: j.cutout_url } : j))).catch(() => null);
  }, [needCutout, jobId]);

  useEffect(() => {
    const e = window.setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => window.clearInterval(e);
  }, []);

  const steps = useMemo(() => {
    const progress = job?.progress ?? {};
    let currentSet = false;
    return STEP_KEYS.map((key) => {
      const done = progress.steps?.[key]?.state === 'done';
      let state: StepState = done ? 'done' : 'pending';
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
      <BackHeader to="/" title={failed ? 'Chưa phân tích được' : 'Đang phân tích'} />

      <div className="relative mx-gutter mt-4 aspect-[4/3] overflow-hidden rounded-card border border-line bg-photo shadow-card">
        {job?.front_photo ? (
          <>
            <img src={job.cutout_url ?? job.front_photo.url} alt="Ảnh phôi đang được đo thân và cành"
              className={cx('h-full w-full object-contain', job.cutout_url && 'bg-surface')} />
            {job.cutout_url ? <span className="absolute left-2 top-2 rounded-chip bg-surface px-2 py-0.5 text-label font-medium text-ink-muted shadow-card">Đã tách nền</span> : null}
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
          <div className="mx-gutter mt-4 flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="flex items-center justify-between text-caption">
              <span className="font-medium">Tiến độ</span>
              <span className="tabular text-ink-subtle">~{remaining} giây</span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Tiến độ phân tích" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full bg-primary transition-[width] duration-base ease-calm" style={{ width: `${pct}%` }} />
            </div>
            <StepList steps={steps} />
          </div>
        </>
      )}

      {!failed && !error ? (
        <div className="mt-auto flex flex-col items-center gap-2 px-gutter pb-7 pt-4">
          <NotifyPrompt />
        </div>
      ) : null}
    </div>
  );
}
