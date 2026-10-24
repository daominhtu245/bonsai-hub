import { useEffect, useState } from 'react';
import { Amphora, Droplets, Flame, Gem, Mountain, Sparkles, Sprout, TreeDeciduous, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Notice } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cx } from '@/lib/cx';
import { useFeature } from '@/lib/features';
import { SPECIES_NAME } from '@/lib/copy';
import { toolsApi, type Menh } from '@/lib/tools';

const EL: Record<string, { Icon: LucideIcon; bg: string; fg: string }> = {
  Kim: { Icon: Gem, bg: 'bg-surface-2', fg: 'text-ink' },
  Mộc: { Icon: TreeDeciduous, bg: 'bg-primary-soft', fg: 'text-primary' },
  Thủy: { Icon: Droplets, bg: 'bg-surface-2', fg: 'text-ink' },
  Hỏa: { Icon: Flame, bg: 'bg-danger-soft', fg: 'text-danger' },
  Thổ: { Icon: Mountain, bg: 'bg-clay-soft', fg: 'text-clay' },
};

/** Cây hợp mệnh theo năm sinh (quan niệm dân gian) — gợi ý quà Tết, tân gia. */
export default function MenhPage() {
  const { user } = useAuth();
  const me = user.status === 'ready' ? user.data : null;
  const [year, setYear] = useState(String(me?.birth_year ?? ''));
  const [m, setM] = useState<Menh | null>(null);
  const [error, setError] = useState<string | null>(null);
  const market = useFeature('market');
  useEffect(() => { if (me?.birth_year && !year) setYear(String(me.birth_year)); }, [me?.birth_year]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const y = Number(year);
    setError(null);
    if (year.length !== 4 || y < 1920 || y > 2030) return setM(null);
    toolsApi.menh(y).then(setM).catch((e: ApiError) => setError(e.message));
  }, [year]);
  return (
    <div className="mx-auto max-w-content pb-10">
      <BackHeader to="/tien-ich" title="Cây hợp mệnh" />
      <div className="flex flex-col gap-4 px-gutter py-4">
        <label className="flex flex-col gap-1 text-caption font-medium">Năm sinh (âm lịch)
          <input inputMode="numeric" maxLength={4} value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} placeholder="Vd. 1975"
            className="min-h-touch rounded-btn border border-line-strong bg-surface px-3 text-body tabular" />
        </label>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {m ? (
          <>
            <section className={cx('flex items-center gap-4 rounded-card p-4 shadow-card', EL[m.element]?.bg ?? 'bg-surface-2')}>
              <span className={cx('flex h-16 w-16 flex-none items-center justify-center rounded-full bg-surface', EL[m.element]?.fg)}>
                {(() => { const I = EL[m.element]?.Icon ?? Sparkles; return <I size={32} strokeWidth={1.5} aria-hidden="true" />; })()}
              </span>
              <div className="flex flex-col">
                <span className="text-label text-ink-muted">{m.can_chi} · {m.nap_am}</span>
                <span className="text-display">Mệnh {m.element}</span>
                <span className="text-caption text-ink-muted">Hợp hành {m.good_elements.join(', ')}</span>
              </div>
            </section>
            <section className="rounded-card border border-line bg-surface p-4 shadow-card">
              <h2 className="m-0 mb-2 flex items-center gap-2 text-caption font-semibold"><Amphora size={16} className="text-clay" aria-hidden="true" />Màu chậu hợp</h2>
              <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">{m.pot_colors.map((c) => <li key={c} className="rounded-full border border-line px-3 py-1 text-caption capitalize">{c}</li>)}</ul>
            </section>
            <section className="rounded-card border border-line bg-surface p-4 shadow-card">
              <h2 className="m-0 mb-2 flex items-center gap-2 text-caption font-semibold"><Sprout size={16} className="text-primary" aria-hidden="true" />Cây hợp mệnh</h2>
              {m.species.length ? (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {m.species.map((sp) => (
                    <li key={sp} className="flex min-h-touch items-center justify-between gap-2 text-body">
                      <span className="font-medium">{SPECIES_NAME[sp] ?? sp}</span>
                      {market ? <Link to={`/cho?species=${sp}`} className="text-caption font-medium">Xem phôi đang bán</Link> : null}
                    </li>
                  ))}
                </ul>
              ) : <p className="m-0 text-caption text-ink-muted">Chọn chậu, đá theo màu hợp.</p>}
            </section>
          </>
        ) : null}
        <p className="m-0 text-label text-ink-subtle">Theo quan niệm dân gian, để tham khảo. Sinh tháng 1–2 dương lịch trước Tết thì tính theo năm trước.</p>
      </div>
    </div>
  );
}
