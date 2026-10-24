import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, GraduationCap, Ruler, Share2, Sofa, SquarePen, Store, ThumbsDown, ThumbsUp, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { NotifyPrompt } from '@/components/NotifyPrompt';
import { SaveAndRemind } from '@/components/SaveAndRemind';
import { SpeakButton } from '@/components/SpeakButton';
import { TreeDiary } from '@/components/TreeDiary';
import { TreePassport } from '@/components/TreePassport';
import { TreeTools } from '@/components/TreeTools';
import {
  Button, ButtonLink, GuideCard, Notice, Segmented, Skeleton, StageTimeline, StepList, StyleName, type StageGuide, type StepState,
} from '@/components/ui';
import { ApiError } from '@/lib/api';
import { FEEDBACK_REASONS } from '@/lib/ruleLabels';
import { useAuth } from '@/lib/auth';
import { cx } from '@/lib/cx';
import { accountApi } from '@/lib/account';
import { jobsApi, resultApi, watchJob, type Job, type ResultView, type StageView } from '@/lib/jobs';
import { mediaApi, type ArtStyle } from '@/lib/media';

type View = 'photo' | ArtStyle;

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

function StageImage({ result, stage, art }: { result: ResultView; stage: StageView; art?: string }) {
  const photo = result.front_photo;
  const ratio = photo?.width && photo?.height ? `${photo.width} / ${photo.height}` : '3 / 4';
  const sketch = !art && (stage.fallback_sketch || !stage.image_url);
  const src = art ?? (sketch ? photo?.url : stage.image_url);
  return (
    <div className="relative mx-gutter mt-4 overflow-hidden rounded-card border border-line bg-photo shadow-card" style={{ aspectRatio: ratio }}>
      {src ? (
        <img
          key={`${stage.code}-${src}`}
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
  const [reasons, setReasons] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = (r: 1 | -1, tags: string[] = [], note?: string) => {
    const prev = rating;
    setRating(r);
    setError(null);
    return resultApi.feedback(jobId, r, tags, note).then(() => setSent(tags.length > 0 || Boolean(note))).catch((e: ApiError) => {
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
          <button key={value} type="button" aria-pressed={rating === value} onClick={() => { setSent(false); void send(value); }}
            className={cx('inline-flex min-h-touch items-center gap-1.5 rounded-btn border px-3 text-caption font-medium',
              rating === value ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-muted hover:text-ink')}>
            <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
            {label}
          </button>
        ))}
      </div>
      {rating === -1 && !sent ? (
        <div className="flex w-full flex-col gap-2 pt-1">
          <span className="text-label text-ink-muted">Sai ở đâu?</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sai ở đâu">
            {FEEDBACK_REASONS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={reasons.includes(k)}
                onClick={() => setReasons((r) => (r.includes(k) ? r.filter((x) => x !== k) : [...r, k]))}
                className={cx('min-h-touch rounded-chip border px-3 text-label', reasons.includes(k) ? 'border-ink bg-surface-2 font-semibold text-ink' : 'border-line text-ink-muted')}>
                {label}
              </button>
            ))}
          </div>
          <input value={comment} onChange={(e) => setComment(e.target.value)} maxLength={300} placeholder="Ghi thêm (không bắt buộc)" aria-label="Ghi thêm"
            className="min-h-touch rounded-btn border border-line-strong bg-surface px-3 text-caption" />
          <Button size="touch" block={false} disabled={!reasons.length && !comment.trim()} onClick={() => send(-1, reasons, comment.trim() || undefined)}>Gửi góp ý</Button>
        </div>
      ) : null}
      {sent ? <span className="w-full text-label text-ink-muted">Cảm ơn bạn — góp ý giúp ảnh lần sau đúng hơn.</span> : null}
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
  const [view, setView] = useState<View>('photo');
  const [arts, setArts] = useState<Partial<Record<ArtStyle, Record<string, string>>>>({});
  const [artError, setArtError] = useState<string | null>(null);
  const pickView = (v: View) => {
    setView(v);
    setArtError(null);
    if (v !== 'photo' && !arts[v]) mediaApi.art(result.job_id, v).then((m) => setArts((a) => ({ ...a, [v]: m }))).catch((e: ApiError) => setArtError(e.message));
  };
  const artMap = view === 'photo' ? undefined : arts[view];

  return (
    <>
      <div className="mx-gutter mt-3">
        <Segmented<View> label="Kiểu xem" value={view} onChange={pickView} options={[['photo', 'Ảnh'], ['pencil', 'Bút chì'], ['ink', 'Thủy mặc']]} />
      </div>
      {view !== 'photo' && !artMap && !artError ? (
        <Skeleton className="mx-gutter mt-4 aspect-[3/4] rounded-card" />
      ) : (
        <StageImage result={result} stage={stage} art={artMap?.[stage.code]} />
      )}
      {artError ? <p className="mx-gutter mt-2 text-label text-danger">{artError}</p> : null}
      {stage.fallback_sketch ? <p className="mx-gutter mt-2 text-label text-ink-subtle">Giai đoạn này hiển thị bản vẽ thay ảnh.</p> : null}
      <div className="mx-gutter mt-4">
        <StageTimeline stages={tabs} current={index} onSelect={setIndex} />
      </div>
      <div className="mx-gutter mt-5">
        {guide ? (
          <>
            <GuideCard guide={guide} done={new Set(stage.done_tasks)} onToggle={(i) => onToggle(stage.code, i)} />
            <SpeakButton className="mt-2" text={[guide.name, guide.see, 'Việc cần làm:', ...guide.actions, guide.season ? `Thời điểm tốt: ${guide.season}` : ''].filter(Boolean).join('. ')} label="Đọc to hướng dẫn" />
          </>
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

      <SaveAndRemind jobId={result.job_id} />
      <TreeDiary treeId={result.tree_id} />
      <TreeTools jobId={result.job_id} />
      <TreePassport treeId={result.tree_id} />

      <section className="mx-gutter mt-4 grid grid-cols-2 gap-2">
        <ButtonLink to={`/chia-se/${result.job_id}`}>
          <Share2 size={18} strokeWidth={1.75} aria-hidden="true" />
          Chia sẻ ảnh
        </ButtonLink>
        <ButtonLink to={`/chon/${result.job_id}`} variant="secondary">Bản vẽ cắt tỉa</ButtonLink>
      </section>
      <nav aria-label="Làm thêm với cây này" className="mx-gutter mt-3">
        <ul className="m-0 list-none divide-y divide-line overflow-hidden rounded-card border border-line bg-surface p-0 shadow-card">
          {([
            [`/ket-qua/${result.job_id}/ban-ve-ky-thuat`, 'Bản vẽ kỹ thuật', Ruler],
            [`/ket-qua/${result.job_id}/dat-vao-phong`, 'Đặt vào phòng', Sofa],
            [`/hoi-nghe-nhan/moi?job=${result.job_id}`, 'Hỏi nghệ nhân', GraduationCap],
            [`/tin-cua-toi?job=${result.job_id}&tree=${result.tree_id}&title=${encodeURIComponent(result.tree_nickname ?? '')}`, 'Đăng bán', Store],
            [`/ket-qua/${result.job_id}/phieu-tap-ve`, 'Phiếu tập vẽ', SquarePen],
          ] as const).map(([to, label, Icon]) => (
            <li key={label}>
              <Link to={to} className="flex min-h-touch items-center gap-3 px-4 py-2.5 text-body text-ink no-underline hover:bg-surface-2">
                <Icon size={18} strokeWidth={1.75} className="text-ink-muted" aria-hidden="true" />
                <span className="flex-1">{label}</span>
                <ChevronRight size={16} className="text-ink-subtle" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

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
