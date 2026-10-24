import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Maximize2, PenTool, X } from 'lucide-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Button, ButtonLink, Notice, Segmented, Skeleton, SketchLegend, StyleName } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SPECIES_NAME } from '@/lib/copy';
import { cx } from '@/lib/cx';
import { jobsApi, type DesignOptionView, type Job } from '@/lib/jobs';

const fmt = (n: number) => n.toLocaleString('vi-VN', { maximumFractionDigits: 1 });
const score = (s: number) => Math.round(s * 10);

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

function Counts({ option, lowerApexCm }: { option: DesignOptionView; lowerApexCm: number | null }) {
  const c = option.counts;
  const items: Array<[string, string]> = [
    ['Cắt bỏ', `${c.cut ?? 0} cành${c.chop_apex ? ' + hạ ngọn' : ''}`],
    ['Giữ lại', `${c.keep ?? 0} cành`],
  ];
  if (c.new) items.push(['Nuôi mới', `${c.new} cành`]);
  if (c.chop_apex && lowerApexCm) items.push(['Hạ ngọn', `khoảng ${fmt(lowerApexCm)} cm`]);
  return (
    <dl className="m-0 grid grid-cols-2 gap-px overflow-hidden rounded-btn border border-line bg-line text-caption">
      {items.map(([k, v], i) => (
        <div key={k} className={cx('bg-surface px-3 py-2', items.length % 2 === 1 && i === items.length - 1 && 'col-span-2')}>
          <dt className="text-label text-ink-subtle">{k}</dt>
          <dd className="tabular m-0 font-medium">{v}</dd>
        </div>
      ))}
    </dl>
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
    <dialog ref={ref} onClose={onClose} aria-label="Bản vẽ phóng to" className="m-0 h-dvh max-h-none w-screen max-w-none bg-bg p-0 text-ink">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between px-gutter py-2">
          <span className="font-semibold">
            <StyleName vi={option.name_vi} jp={option.name_jp} />
          </span>
          <button type="button" onClick={onClose} aria-label="Đóng" className="flex h-touch w-touch items-center justify-center rounded-btn hover:bg-surface-2">
            <X size={20} strokeWidth={1.75} />
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
        const wanted = new URLSearchParams(window.location.search).get('option'); // quay về từ Tự thiết kế
        setSelected((s) => s ?? (j.options.some((o) => o.id === wanted) ? wanted : j.options[0]?.id) ?? null);
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
        <BackHeader to="/" title="Chọn thế" right="3 / 3" />
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
      <BackHeader to="/" title="Chọn thế" right="3 / 3" />

      {a ? (
        <section className="mx-gutter mt-4 flex flex-col gap-2">
          <dl className="m-0 grid grid-cols-3 gap-px overflow-hidden rounded-card border border-line bg-line shadow-card">
            {([
              ['Loài', a.species_key ? SPECIES_NAME[a.species_key] ?? a.species_key : '—'],
              ['Chiều cao', a.height_cm ? `${fmt(a.height_cm)} cm` : '—'],
              ['Ø gốc', a.base_diameter_cm ? `${fmt(a.base_diameter_cm)} cm` : '—'],
            ] as const).map(([k, v]) => (
              <div key={k} className="bg-surface px-3 py-2.5">
                <dt className="text-label text-ink-subtle">{k}</dt>
                <dd className="tabular m-0 font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          {a.summary_vi ? <p className="m-0 text-caption text-ink-muted">{a.summary_vi}</p> : null}
        </section>
      ) : null}

      {retry ? (
        <div className="mx-gutter mt-4">
          <Notice tone="warn">Lần trước tạo ảnh chưa thành công, đã hoàn lượt cho bạn.</Notice>
        </div>
      ) : null}

      {suggested && !readOnly ? (
        <div className="mx-gutter mt-4 flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-card">
          <img src={suggested.url} alt="Mặt AI gợi ý làm mặt tiền" className="h-14 w-14 flex-none rounded-[6px] object-cover" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-caption font-medium">Mặt này có thể đẹp hơn làm mặt tiền</span>
            <Button variant="secondary" size="touch" block={false} disabled={submitting} onClick={() => reanalyze(suggested.id)} className="self-start">
              Phân tích lại với mặt này
            </Button>
          </div>
        </div>
      ) : null}

      {!readOnly && job.options.length > 1 ? (
        <div className="mx-gutter mt-5 grid gap-2" style={{ gridTemplateColumns: `repeat(${job.options.length}, minmax(0, 1fr))` }} role="tablist" aria-label="Phương án">
          {job.options.map((o) => (
            <button key={o.id} type="button" role="tab" aria-selected={o.id === option.id} onClick={() => setSelected(o.id)}
              className={cx('flex min-h-[56px] flex-col items-start justify-center rounded-btn border px-3 py-2 text-left transition-colors',
                o.id === option.id ? 'border-ink bg-surface shadow-card' : 'border-line bg-surface-2 text-ink-muted hover:text-ink')}>
              <span className="text-caption font-semibold [overflow-wrap:anywhere]">{o.name_vi}</span>
              <span className="tabular text-label text-ink-subtle">{o.source === 'user' ? 'Của bạn' : `${score(o.suitability)}/10`}</span>
            </button>
          ))}
        </div>
      ) : null}

      {!readOnly && job.status === 'awaiting_choice' ? (
        <div className="mx-gutter mt-3">
          <ButtonLink to={`/tu-thiet-ke/${job.id}`} variant="secondary" size="touch">
            <PenTool size={18} strokeWidth={1.75} aria-hidden="true" />
            {job.options.some((o) => o.source === 'user') ? 'Sửa thiết kế của bạn' : 'Tự thiết kế'}
          </ButtonLink>
        </div>
      ) : null}

      <section className="mx-gutter mt-3 overflow-hidden rounded-card border border-line bg-surface shadow-card" aria-labelledby="opt-title">
        <div className="flex items-start justify-between gap-2 px-4 pb-3 pt-4">
          <div>
            <h2 id="opt-title" className="text-h1">
              <StyleName vi={option.name_vi} jp={option.name_jp} />
            </h2>
            <div className="text-caption text-ink-muted">{option.source === 'user' ? 'Thiết kế của bạn' : option.rank === 1 ? 'Phù hợp nhất' : `Phương án ${option.rank}`}</div>
          </div>
          {readOnly ? <span className="flex-none rounded-chip bg-primary-soft px-2 py-0.5 text-label font-medium text-primary-ink">Đã dùng</span> : null}
        </div>

        <div className="border-y border-line">
          <Overlay job={job} option={option} showSketch={showSketch} />
        </div>

        <div className="flex items-center gap-2 px-4 pt-3">
          <div className="flex-1">
            <Segmented<'sketch' | 'photo'> label="Lớp hiển thị" value={showSketch ? 'sketch' : 'photo'} onChange={(v) => setShowSketch(v === 'sketch')}
              options={[['sketch', 'Bản vẽ'], ['photo', 'Ảnh gốc']]} />
          </div>
          <button type="button" aria-label="Phóng to bản vẽ" onClick={() => setZoom(true)} className="flex h-touch w-touch items-center justify-center rounded-btn border border-line text-ink-muted hover:bg-surface-2 hover:text-ink">
            <Maximize2 size={18} strokeWidth={1.75} />
          </button>
        </div>

        <div className="flex flex-col gap-3 p-4">
          <SketchLegend />
          <Counts option={option} lowerApexCm={a?.lower_apex_cm ?? null} />
          {option.source === 'user' ? null : <div className="flex items-center gap-3">
            <span className="text-caption text-ink-muted">Mức phù hợp</span>
            <div className="h-1 flex-1 rounded-full bg-surface-2" aria-hidden="true">
              <div className="h-full rounded-full bg-primary" style={{ width: `${score(option.suitability) * 10}%` }} />
            </div>
            <span className="tabular text-caption font-semibold">{score(option.suitability)}/10</span>
          </div>}
          <p className="m-0 text-caption">{option.why_vi}</p>
          {option.remove_reasons_vi.length || option.new_branch_notes_vi.length || option.care_steps_vi.length ? (
            <details className="group text-caption">
              <summary className="flex min-h-touch cursor-pointer list-none items-center gap-1.5 font-medium [&::-webkit-details-marker]:hidden">
                <ChevronDown size={16} className="text-ink-subtle transition-transform group-open:rotate-180" aria-hidden="true" />
                Chi tiết cắt tỉa
              </summary>
              <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-ink-muted">
                {option.remove_reasons_vi.map((r, i) => <li key={`r${i}`}>Cắt: {r}</li>)}
                {option.new_branch_notes_vi.map((r, i) => <li key={`n${i}`}>Nuôi: {r}</li>)}
                {option.care_steps_vi.map((r, i) => <li key={`c${i}`}>{r}</li>)}
              </ul>
            </details>
          ) : null}
        </div>
      </section>

      {readOnly ? (
        <div className="mt-auto px-gutter pb-6 pt-5">
          <ButtonLink to={`/ket-qua/${job.id}`} variant="secondary">
            Về ảnh kết quả
          </ButtonLink>
        </div>
      ) : (
      <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-line bg-surface px-gutter pb-6 pt-4">
        {submitError && submitError.status !== 402 ? <Notice tone="danger">{submitError.message}</Notice> : null}
        {noCredit ? (
          <>
            <Notice tone="warn">Bạn đã hết lượt.</Notice>
            <ButtonLink to="/mua-luot">Mua lượt</ButtonLink>
          </>
        ) : (
          <>
            <Button onClick={choose} loading={submitting} loadingLabel="Đang bắt đầu…">
              {retry ? 'Thử lại · dùng 1 lượt' : 'Tạo ảnh tương lai · dùng 1 lượt'}
            </Button>
            <span className="tabular text-center text-label text-ink-subtle">
              Còn {job.credits_left} lượt · <Link to="/mua-luot">Mua thêm</Link>
            </span>
          </>
        )}
      </div>
      )}

      {zoom ? <ZoomDialog job={job} option={option} onClose={() => setZoom(false)} /> : null}
    </div>
  );
}
