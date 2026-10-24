import { useEffect, useState } from 'react';
import { CloudRain, Snowflake, Sun, Wind } from 'lucide-react';
import { BackHeader } from '@/components/BackHeader';
import { Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { assistApi, type Weather } from '@/lib/assist';
import { useAuth } from '@/lib/auth';
import { toolsApi, type Province } from '@/lib/tools';

const ICON = { heavy_rain: CloudRain, heat: Sun, cold: Snowflake, wind: Wind } as const;
const dm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;

/** E2 — Thời tiết 3 ngày theo tỉnh + việc nên làm khi sắp mưa to / nắng nóng / rét / gió mạnh. Có thông báo lúc 6:30. */
export default function WeatherPage() {
  const { user } = useAuth();
  const me = user.status === 'ready' ? user.data : null;
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [province, setProvince] = useState('');
  const [w, setW] = useState<Weather | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { toolsApi.provinces().then(setProvinces).catch(() => null); }, []);
  const settled = user.status !== 'loading';
  useEffect(() => { if (settled && !province) setProvince(me?.province ?? 'ho_chi_minh'); }, [settled, me?.province]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!province) return;
    setW(null);
    setError(null);
    assistApi.weather(province).then(setW).catch((e: ApiError) => setError(e.message));
  }, [province]);
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/tien-ich" title="Thời tiết & việc cần làm" />
      <div className="flex flex-col gap-3 px-gutter py-3">
        <label className="flex flex-col gap-1 text-caption font-medium">Tỉnh, thành
          <select value={province} onChange={(e) => setProvince(e.target.value)} className="min-h-touch rounded-btn border border-line-strong bg-surface px-3 text-body">
            {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </label>
        {error ? <Notice tone="danger">{error}</Notice> : !w ? <Skeleton className="h-40 rounded-card" /> : (
          <>
            <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0">
              {w.days.map((d) => (
                <li key={d.date} className="flex flex-col items-center gap-0.5 rounded-card border border-line bg-surface p-3 text-caption shadow-card">
                  <span className="font-semibold">{dm(d.date)}</span>
                  <span className="tabular">{Math.round(d.min_c)}–{Math.round(d.max_c)}°</span>
                  <span className="tabular text-ink-muted">{Math.round(d.rain_mm)} mm</span>
                </li>
              ))}
            </ul>
            {w.alerts.length ? w.alerts.map((a) => {
              const Icon = ICON[a.kind];
              return (
                <section key={`${a.date}${a.kind}`} className="flex gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
                  <Icon size={22} className="flex-none text-warn" aria-hidden="true" />
                  <div className="text-caption"><div className="font-semibold">{a.title_vi} · {dm(a.date)}</div><p className="m-0 mt-1">{a.advice_vi}</p></div>
                </section>
              );
            }) : <Notice tone="success">3 ngày tới thời tiết bình thường.</Notice>}
          </>
        )}
      </div>
    </div>
  );
}
