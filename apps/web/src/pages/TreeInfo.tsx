import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Button, Notice, Skeleton } from '@/components/ui';
import { ApiError, uploadPhoto } from '@/lib/api';
import { useCapture, VIEW_LABELS } from '@/lib/capture';
import { cx } from '@/lib/cx';
import { jobsApi, type Species } from '@/lib/jobs';

const FALLBACK_SPECIES: Species[] = [
  { key: 'si', name_vi: 'Si', growth_speed: 'fast' },
  { key: 'sanh', name_vi: 'Sanh', growth_speed: 'fast' },
  { key: 'mai_chieu_thuy', name_vi: 'Mai chiếu thủy', growth_speed: 'medium' },
  { key: 'tung_la_han', name_vi: 'Tùng la hán', growth_speed: 'slow' },
  { key: 'linh_sam', name_vi: 'Linh sam', growth_speed: 'slow' },
];
const ORDER = FALLBACK_SPECIES.map((s) => s.key);

type Submit = { status: 'idle' } | { status: 'working'; label: string } | { status: 'error'; message: string };

/** Màn 03 — Thông tin cây (design/mockups/TreeInfo.dc.html). Mọi trường trừ ảnh đều tùy chọn. */
export default function TreeInfo() {
  const { shots, frontId, setFront, reset } = useCapture();
  const navigate = useNavigate();
  const [species, setSpecies] = useState<Species[] | null>(null);
  const [speciesKey, setSpeciesKey] = useState<string | null>(null);
  const [height, setHeight] = useState('');
  const [nickname, setNickname] = useState('');
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
      const job = await jobsApi.createJob(tree.id);
      reset();
      navigate(`/phan-tich/${job.id}`, { replace: true });
    } catch (err) {
      setSubmit({ status: 'error', message: err instanceof ApiError ? err.message : 'Có lỗi xảy ra, bạn thử lại nhé.' });
    }
  };

  const working = submit.status === 'working';

  return (
    <form onSubmit={onSubmit} className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/chup" title="Thông tin cây" right="Bước 2/3" />

      <section className="flex flex-col gap-2 px-gutter pt-1">
        <div className="text-caption text-ink-muted" id="front-hint">
          {shots.length} ảnh đã chụp · chạm để chọn mặt tiền
        </div>
        <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-labelledby="front-hint">
          {shots.map((s, i) => {
            const selected = s.id === frontId;
            return (
              <button
                key={s.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={`${VIEW_LABELS[i]}${selected ? ', đang là mặt tiền' : ''}`}
                onClick={() => setFront(s.id)}
                className={cx('relative aspect-square overflow-hidden rounded-img bg-photo', selected ? 'border-2 border-primary' : 'border border-line')}
              >
                <img src={s.url} alt="" className="h-full w-full object-cover" />
                {selected ? (
                  <span className="absolute inset-x-0 bottom-1 mx-auto w-max rounded-[4px] bg-primary px-1.5 text-[11px] font-semibold text-primary-on">Mặt tiền</span>
                ) : null}
              </button>
            );
          })}
        </div>
      </section>

      <section className="flex flex-col gap-2.5 px-gutter pt-6">
        <h2 className="text-h2" id="species-label">Đây là cây gì?</h2>
        <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-labelledby="species-label">
          {species === null
            ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-[76px] rounded-card" />)
            : [{ key: null as string | null, name_vi: 'AI nhận diện' }, ...species].map((sp) => {
                const selected = speciesKey === sp.key;
                return (
                  <button
                    key={sp.key ?? 'ai'}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSpeciesKey(sp.key)}
                    className={cx(
                      'flex h-[76px] flex-col items-center justify-center gap-1 rounded-card px-1 text-caption',
                      selected ? 'border-2 border-primary bg-primary-soft font-semibold text-primary-ink' : 'border border-line bg-surface text-ink',
                    )}
                  >
                    {sp.key === null ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9l-4.7 1.8L12 15.5l-1.8-4.7L5.5 9l4.7-1.3L12 3zM18 15l.9 2.1 2.1.9-2.1.9L18 21l-.9-2.1L15 18l2.1-.9L18 15z" /></svg>
                    ) : null}
                    {sp.name_vi}
                  </button>
                );
              })}
        </div>
      </section>

      <section className="flex flex-col gap-3.5 px-gutter pt-6">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="height" className="text-caption font-medium">
            Chiều cao hiện tại <span className="font-normal text-ink-muted">(không bắt buộc)</span>
          </label>
          <div className={cx('flex min-h-cta items-center rounded-btn border bg-surface px-3.5', heightInvalid ? 'border-danger' : 'border-line-strong')}>
            <input
              id="height"
              type="text"
              inputMode="decimal"
              placeholder="Ví dụ 45"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              aria-invalid={heightInvalid}
              aria-describedby={heightInvalid ? 'height-err' : undefined}
              className="min-w-0 flex-1 bg-transparent text-body text-ink outline-none"
            />
            <span className="text-ink-muted">cm</span>
          </div>
          {heightInvalid ? <span id="height-err" className="text-label text-danger">Chiều cao cần là số từ 1 đến 999 cm.</span> : null}
          <span className="text-label text-ink-muted">Có chiều cao thật, bản vẽ sẽ ghi được số đo bằng cm.</span>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="nickname" className="text-caption font-medium">
            Đặt tên cho cây <span className="font-normal text-ink-muted">(không bắt buộc)</span>
          </label>
          <input
            id="nickname"
            type="text"
            maxLength={120}
            placeholder="Ví dụ Si gốc lũa sân sau"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className="min-h-cta rounded-btn border border-line-strong bg-surface px-3.5 text-body text-ink"
          />
        </div>
      </section>

      <div className="mt-auto flex flex-col gap-2 px-gutter pb-7 pt-4">
        {submit.status === 'error' ? <Notice tone="danger">{submit.message}</Notice> : null}
        <Button type="submit" loading={working} loadingLabel={working ? submit.label : undefined} disabled={heightInvalid}>
          Phân tích phôi · miễn phí
        </Button>
        <span className="text-center text-caption text-ink-muted">Khoảng 30 giây. Chưa trừ lượt.</span>
      </div>
    </form>
  );
}
