import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { BeforeAfterSlider, Button, ButtonLink, Notice, Skeleton, StepList, type StepState } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { jobsApi, watchJob, type Job } from '@/lib/jobs';

function phaseBSteps(job: Job) {
  const steps = job.progress.steps ?? {};
  const repair = steps.repair;
  const list: Array<{ key: string; done: boolean; label: string }> = [
    { key: 'render', done: steps.render?.state === 'done', label: 'Vẽ 3 phương án ảnh cây sau khi hoàn thiện' },
    { key: 'judge', done: steps.judge?.state === 'done', label: 'Chấm ảnh: giữ đúng thân, gốc và nền' },
  ];
  if (repair) {
    const round = typeof repair.round === 'number' ? repair.round : typeof repair.rounds === 'number' ? repair.rounds : 1;
    list.splice(2, 0, { key: 'repair', done: repair.state === 'done', label: `Vẽ lại ảnh chưa đạt (lần ${round})` });
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

/** Kết quả phiên B. Tuần 4 bổ sung timeline S0–S4 và thẻ hướng dẫn (màn 06 đầy đủ). */
export default function Result() {
  const { jobId = '' } = useParams();
  const { refresh } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stop = () => {};
    jobsApi
      .get(jobId)
      .then((j) => {
        setJob(j);
        if (j.status === 'done' || j.status === 'failed') return;
        stop = watchJob(
          jobId,
          (ev) => {
            if (ev.status === 'done' || ev.status === 'failed') {
              jobsApi.get(jobId).then(setJob).catch((e: ApiError) => setError(e.message));
              if (ev.status === 'failed') refresh(); // lượt đã được hoàn
            } else setJob((p) => (p ? { ...p, ...ev } : p));
          },
          (e) => setError(e.message),
        );
      })
      .catch((e: ApiError) => setError(e.message));
    return () => stop();
  }, [jobId, refresh]);

  const steps = useMemo(() => (job ? phaseBSteps(job) : []), [job]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/" title={job?.tree_nickname ?? 'Ảnh tương lai'} right={job?.result?.chosen_style_vi ?? undefined} />
      <main className="flex flex-col gap-4 px-gutter pb-8 pt-2">
        {error ? (
          <Notice tone="danger" action={<Button variant="secondary" size="touch" block={false} onClick={() => location.reload()}>Tải lại</Button>}>{error}</Notice>
        ) : !job ? (
          <Skeleton className="aspect-[3/4] rounded-card" />
        ) : job.status === 'failed' ? (
          <>
            <Notice tone="danger">Tạo ảnh chưa thành công. Đã hoàn lượt cho bạn.</Notice>
            <ButtonLink to={`/chon/${job.id}`} variant="secondary">
              Xem lại bản vẽ
            </ButtonLink>
          </>
        ) : job.status === 'done' && job.result && job.front_photo ? (
          <>
            <div className="relative">
              <BeforeAfterSlider
                before={<img src={job.front_photo.url} alt="Ảnh phôi hôm nay" />}
                after={<img src={job.result.final_url} alt={`Minh họa cây sau khoảng ${job.result.years ?? ''} năm tạo dáng`} />}
                beforeLabel="Phôi · hôm nay"
                afterLabel={`Minh họa sau ~${job.result.years ?? '?'} năm`}
                initial={30}
              />
              <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-surface px-2.5 py-1 text-label font-semibold text-ink">Minh họa</span>
            </div>
            {job.result.low_confidence ? (
              <Notice tone="warn">
                Độ tin cậy thấp: ảnh có thể chưa giữ đúng hoàn toàn dáng thân gốc. Bạn dùng để tham khảo hướng tạo dáng, bám theo bản vẽ khi cắt tỉa.
              </Notice>
            ) : null}
            <Notice tone="success">Lộ trình chăm theo từng giai đoạn (S1–S3) sẽ có trong bản cập nhật tới.</Notice>
            <ButtonLink to={`/chon/${job.id}`} variant="secondary">
              Xem lại bản vẽ cắt tỉa
            </ButtonLink>
            <p className="m-0 text-label text-ink-muted">Ảnh là minh họa định hướng; kết quả thực tế phụ thuộc chăm sóc và điều kiện trồng.</p>
          </>
        ) : (
          <>
            <div className="relative aspect-[3/4] overflow-hidden rounded-card border border-line bg-photo">
              {job.front_photo ? <img src={job.front_photo.url} alt="Ảnh phôi gốc" className="h-full w-full object-contain opacity-60" /> : null}
              <div aria-hidden="true" className="scan-line pointer-events-none absolute inset-x-0 h-1/4" />
            </div>
            <StepList steps={steps} />
            <p className="m-0 text-center text-caption text-ink-muted">Khoảng 2–4 phút. Nếu có lỗi, lượt sẽ được hoàn tự động.</p>
          </>
        )}
      </main>
    </div>
  );
}
