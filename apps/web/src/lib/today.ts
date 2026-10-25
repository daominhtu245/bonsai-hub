import { useEffect, useState } from 'react';
import { CloudRain, CloudSun, Snowflake, Sun, Wind, type LucideIcon } from 'lucide-react';
import { assistApi, type Weather } from './assist';
import { useAuth } from './auth';
import { useFeatures } from './features';
import { toolsApi } from './tools';

const WEATHER_ICON = { heavy_rain: CloudRain, heat: Sun, cold: Snowflake, wind: Wind } as const;
export const daysUntil = (iso: string) => Math.max(0, Math.ceil((new Date(`${iso}T00:00:00`).getTime() - Date.now()) / 86400000));

/** Thời tiết nơi ở + đếm ngược Tết (trang chủ, tiện ích). Tính năng đang tắt thì không tải. */
const memo: { weather: Record<string, Weather>; tet: Record<string, { tet: string; from: string }> } = { weather: {}, tet: {} };

export function useToday() {
  const { user } = useAuth();
  const on = useFeatures();
  const province = user.status === 'ready' ? user.data.province ?? null : null;
  const pk = province ?? '';
  const [w, setW] = useState<Weather | null>(memo.weather[pk] ?? null);
  const [tet, setTet] = useState<{ tet: string; from: string } | null>(memo.tet[pk] ?? null);
  useEffect(() => { // nhớ theo tỉnh trong phiên: quay lại trang là có ngay
    if (province && on('weather') && !memo.weather[pk]) assistApi.weather(province).then((v) => { memo.weather[pk] = v; setW(v); }).catch(() => null);
    if (on('mai_tet') && !memo.tet[pk]) toolsApi.maiTet(province).then((p) => { memo.tet[pk] = { tet: p.tet, from: p.defoliate_from }; setTet(memo.tet[pk]); }).catch(() => null);
    setW(memo.weather[pk] ?? null);
    setTet(memo.tet[pk] ?? null);
  }, [province]); // eslint-disable-line react-hooks/exhaustive-deps
  const today = w?.days[0] ?? null;
  const alert = w?.alerts[0] ?? null;
  const WIcon: LucideIcon = alert ? WEATHER_ICON[alert.kind] : today && today.rain_mm >= 5 ? CloudRain : today && today.max_c >= 33 ? Sun : CloudSun;
  return { province, weather: w, today, alert, WIcon, tet };
}
