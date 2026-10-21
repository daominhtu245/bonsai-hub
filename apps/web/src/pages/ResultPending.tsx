import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Button, ButtonLink, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { jobsApi, watchJob, type Job } from '@/lib/jobs';

const STAGE_TEXT: Partial<Record<Job['status'], string>> = {
  rendering_final: 'Đang vẽ cây sau khi hoàn thiện…',
  judging: 'Đang chấm và chọn ảnh giữ đúng thân cây…',
  rendering_stages: 'Đang vẽ các giai đoạn phát triển…',
  writing_guide: 'Đang viết hướng dẫn chăm từng giai đoạn…',
};

/** Chờ phiên B. Màn 06 (Kết quả + lộ trình) đầy đủ làm ở tuần 4. */
export default function ResultPending() {
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
            setJob((p) => (p ? { ...p, ...ev } : p));
            if (ev.status === 'failed') refresh(); // số lượt đã được hoàn
          },
          (e) => setError(e.message),
        );
      })
      .catch((e: ApiError) => setError(e.message));
    return () => stop();
  }, [jobId, refresh]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/" title={job?.tree_nickname ?? 'Ảnh tương lai'} />
      <main className="flex flex-col gap-4 px-gutter pt-2">
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
        ) : job.status === 'done' ? (
          <Notice tone="success">Ảnh tương lai đã xong. Màn hình kết quả và lộ trình đang được hoàn thiện.</Notice>
        ) : (
          <>
            <div className="relative aspect-[3/4] overflow-hidden rounded-card border border-line bg-photo">
              {job.front_photo ? <img src={job.front_photo.url} alt="Ảnh phôi gốc" className="h-full w-full object-contain opacity-60" /> : null}
              <div aria-hidden="true" className="scan-line pointer-events-none absolute inset-x-0 h-1/4" />
            </div>
            <p className="m-0 text-center" aria-live="polite">{STAGE_TEXT[job.status] ?? 'Đang chuẩn bị…'}</p>
            <p className="m-0 text-center text-caption text-ink-muted">Khoảng 2–4 phút. Nếu có lỗi, lượt sẽ được hoàn tự động.</p>
          </>
        )}
      </main>
    </div>
  );
}
