import { useEffect, useState } from 'react';
import { BackHeader } from '@/components/BackHeader';
import { Notice } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SPECIES_NAME } from '@/lib/copy';
import { toolsApi, type Menh } from '@/lib/tools';

/** Cây hợp mệnh theo năm sinh (quan niệm dân gian) — gợi ý quà Tết, tân gia. */
export default function MenhPage() {
  const { user } = useAuth();
  const me = user.status === 'ready' ? user.data : null;
  const [year, setYear] = useState(String(me?.birth_year ?? ''));
  const [m, setM] = useState<Menh | null>(null);
  const [error, setError] = useState<string | null>(null);
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
          <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
            <div>
              <div className="text-caption text-ink-muted">{m.can_chi} · {m.nap_am}</div>
              <div className="text-[22px] font-semibold">Mệnh {m.element}</div>
            </div>
            <div className="text-caption"><span className="text-ink-muted">Hành hợp: </span>{m.good_elements.join(', ')}</div>
            <div className="text-caption"><span className="text-ink-muted">Màu chậu hợp: </span>{m.pot_colors.join(', ')}</div>
            <div className="text-caption"><span className="text-ink-muted">Cây gợi ý: </span>{m.species.length ? m.species.map((s) => SPECIES_NAME[s] ?? s).join(', ') : 'Chọn chậu, đá theo màu hợp'}</div>
          </div>
        ) : null}
        <p className="m-0 text-label text-ink-subtle">Theo quan niệm dân gian, để tham khảo. Sinh tháng 1–2 dương lịch trước Tết thì tính theo năm trước.</p>
      </div>
    </div>
  );
}
