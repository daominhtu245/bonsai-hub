import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Button, Notice, Segmented, Skeleton } from '@/components/ui';
import { accountApi } from '@/lib/account';
import { ApiError, uploadPhoto } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useCapture, VIEW_LABELS } from '@/lib/capture';
import { cx } from '@/lib/cx';
import { jobsApi, type Region, type Species } from '@/lib/jobs';

const FALLBACK_SPECIES: Species[] = [
  { key: 'si', name_vi: 'Si', growth_speed: 'fast' },
  { key: 'sanh', name_vi: 'Sanh', growth_speed: 'fast' },
  { key: 'mai_chieu_thuy', name_vi: 'Mai chiếu thủy', growth_speed: 'medium' },
  { key: 'tung_la_han', name_vi: 'Tùng la hán', growth_speed: 'slow' },
  { key: 'linh_sam', name_vi: 'Linh sam', growth_speed: 'slow' },
];
const ORDER = FALLBACK_SPECIES.map((s) => s.key);

type Submit = { status: 'idle' } | { status: 'working'; label: string } | { status: 'error'; message: string };

function Field({ label, htmlFor, optional, children }: { label: string; htmlFor?: string; optional?: boolean; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={htmlFor} className="text-caption font-medium">
        {label} {optional ? <span className="font-normal text-ink-subtle">· không bắt buộc</span> : null}
      </label>
      {children}
    </div>
  );
}

const input = 'min-h-cta w-full rounded-btn border border-line-strong bg-surface px-3.5 text-body text-ink shadow-card placeholder:text-ink-subtle';

/** Màn 03 — Thông tin cây. Mọi trường trừ ảnh đều tùy chọn. */
export default function TreeInfo() {
  const { shots, frontId, setFront, reset } = useCapture();
  const navigate = useNavigate();
  const { user, setUser } = useAuth();
  const [species, setSpecies] = useState<Species[] | null>(null);
  const [speciesKey, setSpeciesKey] = useState<string | null>(null);
  const [height, setHeight] = useState('');
  const [nickname, setNickname] = useState('');
  const [region, setRegion] = useState<Region | ''>('');
  const alreadyConsented = user.status === 'ready' && user.data.consent_training;
  const [consent, setConsent] = useState(false);
  const [submit, setSubmit] = useState<Submit>({ status: 'idle' });

  useEffect(() => {
    jobsApi
      .species()
      .then((list) => setSpecies([...list].sort((a, b) => ORDER.indexOf(a.key) - ORDER.indexOf(b.key))))
      .catch(() => setSpecies(FALLBACK_SPECIES));
  }, []);

  if (shots.length === 0 && submit.status !== 'working') return <Navigate to="/chup" replace />;

  const heightNum = height ? Number(height.replace(',', '.')) : undefined;
  const heightInvalid = heightNum !== undefined && (!Number.isFinite(heightNum) || heightNum <= 0 || heightNum >= 1000);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (heightInvalid) return;
    try {
      const keys: string[] = [];
      for (let i = 0; i < shots.length; i++) {
        setSubmit({ status: 'working', label: `Đang tải ảnh ${i + 1}/${shots.length}…` });
        keys.push(await uploadPhoto(shots[i].blob));
      }
      setSubmit({ status: 'working', label: 'Đang tạo hồ sơ cây…' });
      const tree = await jobsApi.createTree({
        nickname: nickname.trim() || undefined,
        species_key: speciesKey ?? undefined,
        real_height_cm: heightNum,
        photos: shots.map((s, i) => ({ key: keys[i], view_index: i, is_front: s.id === frontId })),
      });
      if (consent && !alreadyConsented) setUser(await accountApi.updateProfile({ consent_training: true }));
      const job = await jobsApi.createJob(tree.id, region ? { region } : {});
      reset();
      navigate(`/phan-tich/${job.id}`, { replace: true });
    } catch (err) {
      setSubmit({ status: 'error', message: err instanceof ApiError ? err.message : 'Có lỗi xảy ra, bạn thử lại nhé.' });
    }
  };

  const working = submit.status === 'working';
  const speciesOptions = species ? [{ key: null as string | null, name_vi: 'AI nhận diện' }, ...species] : null;

  return (
    <form onSubmit={onSubmit} className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/chup" title="Thông tin cây" right="2 / 3" />

      <div className="flex flex-col gap-6 px-gutter pb-6 pt-5">
        <section className="flex flex-col gap-2">
          <h2 className="eyebrow" id="front-label">Mặt tiền</h2>
          <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-labelledby="front-label">
            {shots.map((s, i) => {
              const selected = s.id === frontId;
              return (
                <button key={s.id} type="button" role="radio" aria-checked={selected} aria-label={`${VIEW_LABELS[i]}${selected ? ', đang là mặt tiền' : ''}`} onClick={() => setFront(s.id)}
                  className={cx('relative aspect-square overflow-hidden rounded-img bg-photo ring-offset-2 ring-offset-bg', selected ? 'ring-2 ring-primary' : 'opacity-80 hover:opacity-100')}>
                  <img src={s.url} alt="" className="h-full w-full object-cover" />
                  {selected ? (
                    <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-on">
                      <Check size={12} strokeWidth={3} aria-hidden="true" />
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="eyebrow" id="species-label">Loài cây</h2>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-labelledby="species-label">
            {speciesOptions === null
              ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-12" />)
              : speciesOptions.map((sp) => {
                  const selected = speciesKey === sp.key;
                  return (
                    <button key={sp.key ?? 'ai'} type="button" role="radio" aria-checked={selected} onClick={() => setSpeciesKey(sp.key)}
                      className={cx('flex min-h-[48px] items-center gap-2 rounded-btn border px-3 text-left text-caption font-medium transition-colors',
                        selected ? 'border-primary bg-primary-soft text-primary-ink' : 'border-line bg-surface text-ink hover:border-line-strong')}>
                      {sp.key === null ? <Sparkles size={16} strokeWidth={1.75} aria-hidden="true" /> : null}
                      {sp.name_vi}
                    </button>
                  );
                })}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <Field label="Chiều cao hiện tại" htmlFor="height" optional>
            <div className={cx('flex min-h-cta items-center rounded-btn border bg-surface px-3.5 shadow-card', heightInvalid ? 'border-danger' : 'border-line-strong')}>
              <input id="height" type="text" inputMode="decimal" placeholder="45" value={height} onChange={(e) => setHeight(e.target.value)}
                aria-invalid={heightInvalid} aria-describedby={heightInvalid ? 'height-err' : undefined}
                className="tabular min-w-0 flex-1 bg-transparent text-body text-ink outline-none placeholder:text-ink-subtle" />
              <span className="text-caption text-ink-subtle">cm</span>
            </div>
            {heightInvalid ? <span id="height-err" className="text-label text-danger">Chiều cao cần là số từ 1 đến 999 cm.</span> : null}
          </Field>
          <Field label="Tên cây" htmlFor="nickname" optional>
            <input id="nickname" type="text" maxLength={120} placeholder="Si gốc lũa sân sau" value={nickname} onChange={(e) => setNickname(e.target.value)} className={input} />
          </Field>
          <Field label="Vùng khí hậu" optional>
            <Segmented<Region | ''> label="Vùng khí hậu" value={region} onChange={setRegion}
              options={[['', 'Không rõ'], ['north', 'Bắc'], ['central', 'Trung'], ['south', 'Nam']]} />
          </Field>
        </section>

        {!alreadyConsented ? (
          <label className="flex cursor-pointer items-start gap-3 text-caption text-ink-muted">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-5 w-5 flex-none" />
            <span>
              Cho phép dùng ảnh để cải thiện AI · <Link to="/dieu-khoan">Điều khoản</Link>
            </span>
          </label>
        ) : null}
      </div>

      <div className="sticky bottom-0 mt-auto flex flex-col gap-2 border-t border-line bg-surface px-gutter pb-6 pt-4">
        {submit.status === 'error' ? <Notice tone="danger">{submit.message}</Notice> : null}
        <Button type="submit" loading={working} loadingLabel={working ? submit.label : undefined} disabled={heightInvalid}>
          Phân tích · miễn phí
        </Button>
      </div>
    </form>
  );
}
