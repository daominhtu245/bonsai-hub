import { useEffect, useState } from 'react';
import { CheckCircle2, CloudDrizzle, CloudRain, CloudSun, Droplets, MapPin, Snowflake, Sun, Wind, type LucideIcon } from 'lucide-react';
import { BackHeader } from '@/components/BackHeader';
import { Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { assistApi, type Weather } from '@/lib/assist';
import { useAuth } from '@/lib/auth';
import { toolsApi, type Province } from '@/lib/tools';

type Day = Weather['days'][number];
const ALERT_ICON = { heavy_rain: CloudRain, heat: Sun, cold: Snowflake, wind: Wind } as const;
const WEEKDAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
const dm = (iso: string) => `${Number(iso.slice(8, 10))}/${Number(iso.slice(5, 7))}`;
const wd = (iso: string, i: number) => (i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : WEEKDAY[new Date(`${iso}T00:00:00`).getDay()]);

function iconFor(d: Day): LucideIcon {
  if (d.rain_mm >= 20) return CloudRain;
  if (d.rain_mm >= 3) return CloudDrizzle;
  if (d.max_c >= 34) return Sun;
  if (d.min_c <= 14) return Snowflake;
  return CloudSun;
}

/** Ngày bình thường vẫn có việc nên làm (không chỉ báo khi xấu trời). */
function tipsFor(d: Day): string[] {
  const t: string[] = [];
  if (d.max_c >= 33) t.push('Tưới đẫm trước 8 giờ sáng, kiểm tra lại chiều muộn.');
  else if (d.rain_mm >= 3) t.push('Có mưa: bỏ tưới hôm nay nếu đất còn ẩm.');
  else t.push('Tưới khi mặt đất se khô.');
  if (d.rain_mm < 3 && d.max_c < 34 && d.wind_kmh < 30) t.push('Trời thuận: hợp để tỉa cành, uốn dây.');
  if (d.wind_kmh >= 30) t.push('Gió khá mạnh: kiểm tra cây đang néo dây, chậu cao.');
  return t;
}

/** E2 — Thời tiết 3 ngày theo tỉnh + việc nên làm; cảnh báo mưa to / nắng nóng / rét / gió mạnh (có thông báo 6:30). */
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
  const today = w?.days[0];
  const TodayIcon = today ? iconFor(today) : CloudSun;
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/tien-ich" title="Thời tiết" />
      <div className="flex flex-col gap-3 px-gutter py-3">
        <label className="relative flex min-h-touch items-center gap-2 self-start rounded-full border border-line bg-surface pl-3 pr-2 text-caption font-medium shadow-card">
          <MapPin size={16} className="text-primary" aria-hidden="true" />
          <span className="sr-only">Tỉnh, thành</span>
          <select value={province} onChange={(e) => setProvince(e.target.value)} className="min-h-touch bg-transparent pr-1">
            {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </label>
        {error ? <Notice tone="danger">{error}</Notice> : !w || !today ? <Skeleton className="h-52 rounded-card" /> : (
          <>
            <section className="flex items-center gap-4 rounded-card border border-line bg-surface p-4 shadow-card" aria-label="Hôm nay">
              <TodayIcon size={64} strokeWidth={1.25} className={w.alerts.some((a) => a.date === today.date) ? 'text-warn' : 'text-primary'} aria-hidden="true" />
              <div className="flex flex-1 flex-col">
                <span className="text-label text-ink-muted">Hôm nay · {dm(today.date)}</span>
                <span className="tabular text-[34px] font-semibold leading-none">{Math.round(today.max_c)}°<span className="text-h2 font-normal text-ink-muted"> / {Math.round(today.min_c)}°</span></span>
                <span className="mt-1 flex gap-3 text-label text-ink-muted">
                  <span className="inline-flex items-center gap-1"><Droplets size={14} aria-hidden="true" />{Math.round(today.rain_mm)} mm</span>
                  <span className="inline-flex items-center gap-1"><Wind size={14} aria-hidden="true" />{Math.round(today.wind_kmh)} km/h</span>
                </span>
              </div>
            </section>
            <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
              {w.days.slice(1).map((d, i) => {
                const Icon = iconFor(d);
                return (
                  <li key={d.date} className="flex items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-card">
                    <Icon size={30} strokeWidth={1.5} className="text-ink-muted" aria-hidden="true" />
                    <span className="flex flex-col text-caption">
                      <span className="font-semibold">{wd(d.date, i + 1)}</span>
                      <span className="tabular text-ink-muted">{Math.round(d.min_c)}–{Math.round(d.max_c)}° · {Math.round(d.rain_mm)} mm</span>
                    </span>
                  </li>
                );
              })}
            </ul>
            {w.alerts.map((a) => {
              const Icon = ALERT_ICON[a.kind];
              return (
                <section key={`${a.date}${a.kind}`} className="flex gap-3 rounded-card border border-warn bg-warn-soft p-4 text-warn-ink">
                  <Icon size={24} className="flex-none" aria-hidden="true" />
                  <div className="text-caption"><div className="font-semibold">{a.title_vi} · {dm(a.date)}</div><p className="m-0 mt-1">{a.advice_vi}</p></div>
                </section>
              );
            })}
            <section className="rounded-card border border-line bg-surface p-4 shadow-card">
              <h2 className="m-0 mb-2 text-caption font-semibold">Việc nên làm hôm nay</h2>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {tipsFor(today).map((t) => <li key={t} className="flex gap-2 text-caption"><CheckCircle2 size={18} className="flex-none text-primary" aria-hidden="true" />{t}</li>)}
              </ul>
            </section>
          </>
        )}
      </div>
    </div>
  );
}
