import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Button, ButtonLink, Card, Notice, Skeleton, StyleName } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SPECIES_NAME } from '@/lib/copy';
import { cx } from '@/lib/cx';
import { jobsApi, type DesignOptionView, type Job } from '@/lib/jobs';

const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const score = (s: number) => Math.round(s * 10);

function firstSentence(text: string) {
  const m = text.match(/^[^.!?]+[.!?]?/);
  return (m ? m[0] : text).trim();
}

function Overlay({ job, option, showSketch, className }: { job: Job; option: DesignOptionView; showSketch: boolean; className?: string }) {
  const photo = job.front_photo;
  const ratio = photo?.width && photo?.height ? `${photo.width} / ${photo.height}` : '3 / 4';
  return (
    <div className={cx('relative w-full bg-photo', className)} style={{ aspectRatio: ratio }}>
      {photo ? <img src={photo.url} alt="Ảnh phôi gốc (mặt tiền)" className="absolute inset-0 h-full w-full" /> : null}
      {showSketch && option.sketch_svg_url ? (
        <img
          src={option.sketch_svg_url}
          alt={`Bản vẽ thiết kế thế ${option.name_vi}: cành cắt nét đứt đỏ có dấu ✕, cành giữ màu xanh, khung tán nét đứt`}
          className="absolute inset-0 h-full w-full"
        />
      ) : null}
    </div>
  );
}

function Legend({ option, lowerApexCm }: { option: DesignOptionView; lowerApexCm: number | null }) {
  const c = option.counts;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-3.5 gap-y-2 p-0 text-caption">
      <li className="flex items-center gap-1.5">
        <svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="var(--seal)" strokeWidth="3" strokeDasharray="4 3" /><path d="m8 1 6 8m0-8-6 8" stroke="var(--seal)" strokeWidth="1.5" /></svg>
        Cắt bỏ ({c.cut ?? 0} cành{c.chop_apex ? ' + hạ ngọn' : ''})
      </li>
      <li className="flex items-center gap-1.5">
        <svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="var(--leaf)" strokeWidth="3" strokeLinecap="round" /></svg>
        Giữ lại ({c.keep ?? 0} cành)
      </li>
      {c.new ? (
        <li className="flex items-center gap-1.5">
          <svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="16" y2="5" stroke="var(--brass)" strokeWidth="3" strokeLinecap="round" /><path d="m15 1 6 4-6 4" fill="var(--brass)" /></svg>
          Nuôi cành mới ({c.new})
        </li>
      ) : null}
      <li className="flex items-center gap-1.5">
        <svg width="22" height="10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="3 2" /></svg>
        Khung tán
      </li>
      {c.chop_apex && lowerApexCm ? <li className="w-full text-ink-muted">Hạ ngọn khoảng {fmt(lowerApexCm)} cm</li> : null}
    </ul>
  );
}

function ZoomDialog({ job, option, onClose }: { job: Job; option: DesignOptionView; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal?.();
    return () => d?.close?.();
  }, []);
  return (
    <dialog ref={ref} onClose={onClose} aria-label="Bản vẽ phóng to" className="m-0 h-dvh max-h-none w-screen max-w-none bg-bg p-0 text-ink backdrop:bg-ink">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-gutter py-2">
          <span className="font-semibold">
            <StyleName vi={option.name_vi} jp={option.name_jp} />
          </span>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-touch w-touch items-center justify-center rounded-btn">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>
        <div className="flex-1 overflow-auto">
          {/* Rộng gấp đôi màn hình: kéo để xem từng cành; chụm hai ngón để phóng to thêm. */}
          <Overlay job={job} option={option} showSketch className="w-[200%] max-w-none" />
        </div>
      </div>
    </dialog>
  );
}

/** Màn 05 — Chọn thế (design/mockups/Choose.dc.html). Chọn xong trừ 1 lượt và bắt đầu phiên B. */
export default function Choose() {
  const { jobId = '' } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [job, setJob] = useState<Job | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showSketch, setShowSketch] = useState(true);
  const [zoom, setZoom] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);

  const load = () => {
    setLoadError(null);
    jobsApi
      .get(jobId)
      .then((j) => {
        setJob(j);
        setSelected((s) => s ?? j.options[0]?.id ?? null);
      })
      .catch((e: ApiError) => setLoadError(e.message));
  };
  useEffect(load, [jobId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (loadError)
    return (
      <div className="mx-auto max-w-content">
        <BackHeader to="/" title="Chọn thế cho cây" />
        <div className="px-gutter">
          <Notice tone="danger" action={<Button variant="secondary" size="touch" block={false} onClick={load}>Thử lại</Button>}>{loadError}</Notice>
        </div>
      </div>
    );

  if (!job)
    return (
      <div className="mx-auto flex max-w-content flex-col gap-4" aria-busy="true">
        <BackHeader to="/" title="Chọn thế cho cây" right="Bước 3/3" />
        <div className="flex flex-col gap-4 px-gutter">
          <Skeleton className="h-28 rounded-card" />
          <Skeleton className="aspect-[3/4] rounded-card" />
          <Skeleton className="h-16 rounded-card" />
        </div>
      </div>
    );

  // Đã chọn và phiên B đã kết thúc → xem lại bản vẽ (chỉ đọc). Đang chạy → về màn chờ.
  const retry = job.status === 'failed' && Boolean(job.can_retry);
  const readOnly = job.status === 'done' || (job.status === 'failed' && job.chosen_option_id !== null && !retry);
  if (job.status !== 'awaiting_choice' && !readOnly && !retry) {
    if (job.chosen_option_id) return <Navigate to={`/ket-qua/${job.id}`} replace />;
    return <Navigate to={`/phan-tich/${job.id}`} replace />;
  }

  if (job.options.length === 0)
    return (
      <div className="mx-auto max-w-content">
        <BackHeader to="/" title="Chọn thế cho cây" />
        <div className="px-gutter">
          <Notice tone="warn" action={<ButtonLink to="/chup" size="touch" block={false} variant="secondary">Chụp lại</ButtonLink>}>
            Chưa có phương án nào cho phôi này. Bạn thử chụp lại rõ hơn nhé.
          </Notice>
        </div>
      </div>
    );

  const option = job.options.find((o) => o.id === (readOnly ? job.chosen_option_id : selected)) ?? job.options[0];
  const front = job.progress.steps?.front;
  const suggested = front && front.is_current === false ? job.photos?.find((p) => p.id === front.suggested_photo_id) : undefined;

  const reanalyze = async (photoId: string) => {
    setSubmitting(true);
    try {
      const next = await jobsApi.createJob(job.tree_id, { front_photo_id: photoId });
      navigate(`/phan-tich/${next.id}`);
    } catch (e) {
      setSubmitError(e as ApiError);
      setSubmitting(false);
    }
  };
  const a = job.analysis;
  const noCredit = job.credits_left <= 0;

  const choose = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await jobsApi.choose(job.id, option.id);
      refresh();
      navigate(`/ket-qua/${job.id}`, { replace: true });
    } catch (e) {
      setSubmitError(e as ApiError);
      if ((e as ApiError).status === 402) setJob({ ...job, credits_left: 0 });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/" title="Chọn thế cho cây" right="Bước 3/3" />

      {a ? (
        <Card className="mx-gutter mt-1 flex flex-col gap-1.5 px-4 py-3.5">
          <div className="flex flex-wrap gap-1.5">
            {a.species_key ? <span className="rounded-full bg-clay-soft px-2.5 py-0.5 text-label font-semibold text-clay">{SPECIES_NAME[a.species_key] ?? a.species_key}</span> : null}
            {a.height_cm ? <span className="rounded-full bg-clay-soft px-2.5 py-0.5 text-label font-semibold text-clay">Cao {fmt(a.height_cm)} cm</span> : null}
            {a.base_diameter_cm ? <span className="rounded-full bg-clay-soft px-2.5 py-0.5 text-label font-semibold text-clay">Ø gốc {fmt(a.base_diameter_cm)} cm</span> : null}
          </div>
          <p className="m-0 text-caption">{a.summary_vi}</p>
        </Card>
      ) : null}

      {retry ? (
        <div className="mx-gutter mt-4">
          <Notice tone="warn">Lần trước tạo ảnh chưa thành công và đã hoàn lượt cho bạn. Bạn có thể chọn lại thế và thử lại.</Notice>
        </div>
      ) : null}

      {suggested && !readOnly ? (
        <div className="mx-gutter mt-4 flex items-center gap-3 rounded-card border border-line bg-surface p-3">
          <img src={suggested.url} alt="Mặt AI gợi ý làm mặt tiền" className="h-16 w-16 flex-none rounded-img object-cover" />
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="text-caption">AI thấy mặt này có thể đẹp hơn để làm mặt tiền.</span>
            <Button variant="secondary" size="touch" block={false} disabled={submitting} onClick={() => reanalyze(suggested.id)}>
              Phân tích lại với mặt này · miễn phí
            </Button>
          </div>
        </div>
      ) : null}

      <section className="mx-gutter mt-5 overflow-hidden rounded-card border-2 border-primary bg-surface" aria-labelledby="opt-title">
        <div className="flex items-center justify-between gap-2 px-3.5 py-3">
          <div>
            <h2 id="opt-title" className="text-h2">
              <StyleName vi={option.name_vi} jp={option.name_jp} />
            </h2>
            <div className="text-caption text-ink-muted">{option.rank === 1 ? 'Phù hợp nhất với phôi này' : `Phương án ${option.rank}`}</div>
          </div>
          <span className="flex-none rounded-full bg-primary px-2.5 py-1 text-label font-semibold text-primary-on">{readOnly ? 'Đã dùng' : 'Đã chọn'}</span>
        </div>

        <div className="border-y border-line">
          <Overlay job={job} option={option} showSketch={showSketch} />
        </div>

        <div className="px-3.5 py-3">
          <Legend option={option} lowerApexCm={a?.lower_apex_cm ?? null} />
        </div>

        <div className="flex gap-2 px-3.5 pb-3" role="group" aria-label="Lớp hiển thị">
          {[
            [true, 'Bản vẽ'],
            [false, 'Ảnh gốc'],
          ].map(([value, label]) => (
            <button
              key={String(label)}
              type="button"
              aria-pressed={showSketch === value}
              onClick={() => setShowSketch(value as boolean)}
              className={cx(
                'min-h-touch flex-1 rounded-btn border text-caption',
                showSketch === value ? 'border-primary bg-primary-soft font-medium text-primary-ink' : 'border-line-strong bg-surface text-ink',
              )}
            >
              {label}
            </button>
          ))}
          <button type="button" aria-label="Phóng to bản vẽ" onClick={() => setZoom(true)} className="flex h-touch w-touch items-center justify-center rounded-btn border border-line-strong bg-surface text-ink">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.4-4.4M11 8v6M8 11h6" /></svg>
          </button>
        </div>

        <div className="flex flex-col gap-1.5 px-3.5 pb-3.5">
          <div className="flex justify-between text-caption">
            <span className="text-ink-muted">Mức phù hợp</span>
            <span className="font-semibold">{score(option.suitability)}/10</span>
          </div>
          <div className="h-1.5 rounded-full bg-line" aria-hidden="true">
            <div className="h-full rounded-full bg-primary" style={{ width: `${score(option.suitability) * 10}%` }} />
          </div>
          <p className="m-0 mt-1 text-caption">{option.why_vi}</p>
          {option.remove_reasons_vi.length || option.new_branch_notes_vi.length || option.care_steps_vi.length ? (
            <details className="mt-1 text-caption">
              <summary className="flex min-h-touch cursor-pointer items-center font-medium text-primary-ink">Chi tiết cắt tỉa</summary>
              <ul className="m-0 flex flex-col gap-1 pl-5">
                {option.remove_reasons_vi.map((r, i) => <li key={`r${i}`}>Cắt: {r}</li>)}
                {option.new_branch_notes_vi.map((r, i) => <li key={`n${i}`}>Nuôi: {r}</li>)}
                {option.care_steps_vi.map((r, i) => <li key={`c${i}`}>{r}</li>)}
              </ul>
            </details>
          ) : null}
        </div>
      </section>

      {job.options.length > 1 && !readOnly ? (
        <section className="mx-gutter mt-3 flex flex-col gap-2.5" aria-label="Phương án khác">
          {job.options
            .filter((o) => o.id !== option.id)
            .map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => {
                  setSelected(o.id);
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 text-left text-ink"
              >
                <div className="w-14 flex-none overflow-hidden rounded-img">
                  <Overlay job={job} option={o} showSketch />
                </div>
                <div className="flex-1">
                  <div className="font-semibold">
                    <StyleName vi={o.name_vi} jp={o.name_jp} />
                  </div>
                  <div className="text-caption text-ink-muted">
                    Phù hợp {score(o.suitability)}/10 · {firstSentence(o.why_vi)}
                  </div>
                </div>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>
              </button>
            ))}
        </section>
      ) : null}

      {readOnly ? (
        <div className="mt-auto px-gutter pb-7 pt-5">
          <ButtonLink to={`/ket-qua/${job.id}`} variant="secondary">
            Về ảnh kết quả
          </ButtonLink>
        </div>
      ) : (
      <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-line bg-surface px-gutter pb-7 pt-5">
        {submitError && submitError.status !== 402 ? <Notice tone="danger">{submitError.message}</Notice> : null}
        {noCredit ? (
          <>
            <Notice tone="warn">Bạn đã hết lượt. Mua thêm lượt để tạo ảnh tương lai cho phương án này.</Notice>
            <ButtonLink to="/mua-luot">Mua lượt</ButtonLink>
          </>
        ) : (
          <>
            <Button onClick={choose} loading={submitting} loadingLabel="Đang bắt đầu…">
              {retry ? 'Thử lại · dùng 1 lượt' : 'Tạo ảnh tương lai · dùng 1 lượt'}
            </Button>
            <span className="text-center text-caption text-ink-muted">
              Bạn còn {job.credits_left} lượt · khoảng 2–4 phút · <Link to="/mua-luot">Mua thêm lượt</Link>
            </span>
          </>
        )}
      </div>
      )}

      {zoom ? <ZoomDialog job={job} option={option} onClose={() => setZoom(false)} /> : null}
    </div>
  );
}
