import { useEffect, useState } from 'react';
import { accountApi } from '@/lib/account';
import { useAuth } from '@/lib/auth';
import { toolsApi, type Province } from '@/lib/tools';

/** Năm sinh + tỉnh (không bắt buộc): dùng cho Cây hợp mệnh, Mai kịp Tết, nhắc theo thời tiết. Tự lưu khi đổi. */
export function ProfileExtras() {
  const { user, setUser } = useAuth();
  const me = user.status === 'ready' ? user.data : null;
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [year, setYear] = useState(me?.birth_year ? String(me.birth_year) : '');
  useEffect(() => { toolsApi.provinces().then(setProvinces).catch(() => null); }, []);
  if (!me) return null;
  const save = (body: { birth_year?: number | null; province?: string | null }) => accountApi.updateProfile(body).then(setUser).catch(() => null);
  return (
    <>
      <label className="flex min-h-touch items-center justify-between gap-3 px-4 py-2 text-body">
        <span className="text-ink-muted">Tỉnh, thành</span>
        <select value={me.province ?? ''} onChange={(e) => save({ province: e.target.value || null })} className="min-h-[40px] max-w-[60%] bg-transparent text-right">
          <option value="">Chưa chọn</option>
          {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
        </select>
      </label>
      <label className="flex min-h-touch items-center justify-between gap-3 px-4 py-2 text-body">
        <span className="text-ink-muted">Năm sinh</span>
        <input inputMode="numeric" maxLength={4} value={year} placeholder="Không bắt buộc" aria-label="Năm sinh"
          onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))}
          onBlur={() => { const y = Number(year); if (!year) save({ birth_year: null }); else if (y >= 1920 && y <= 2030) save({ birth_year: y }); }}
          className="min-h-[40px] w-[140px] bg-transparent text-right tabular" />
      </label>
    </>
  );
}
