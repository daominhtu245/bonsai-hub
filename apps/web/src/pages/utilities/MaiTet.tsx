import { useEffect, useState } from 'react';
import { CalendarPlus, Check, Flower2, MapPin } from 'lucide-react';
import { BackHeader } from '@/components/BackHeader';
import { Button, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { cx } from '@/lib/cx';
import { icsFor, toolsApi, type MaiPlan, type Province } from '@/lib/tools';

const vnDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });

/** Mai kịp Tết: chọn tỉnh → ngày tuốt lá + các bước, thêm vào lịch điện thoại. */
export default function MaiTetPage() {
  const { user } = useAuth();
  const me = user.status === 'ready' ? user.data : null;
  const [provinces, setProvinces] = useState<Province[]>([]);
  const [province, setProvince] = useState<string>(me?.province ?? '');
  const [plan, setPlan] = useState<MaiPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { toolsApi.provinces().then(setProvinces).catch(() => null); }, []);
  useEffect(() => { if (me?.province && !province) setProvince(me.province); }, [me?.province]); // eslint-disable-line react-hooks/exhaustive-deps
  const authSettled = user.status !== 'loading';
  const waitProfile = Boolean(me?.province) && !province; // tỉnh trong hồ sơ sắp được chọn → khỏi tải 2 lần
  useEffect(() => {
    if (!authSettled || waitProfile) return;
    let live = true;
    setPlan(null);
    toolsApi.maiTet(province || null).then((p) => live && setPlan(p)).catch((e: ApiError) => live && setError(e.message));
    return () => { live = false; };
  }, [province, authSettled, waitProfile]);
  const download = () => {
    if (!plan) return;
    const ics = icsFor('Mai kịp Tết', plan.steps.map((s) => ({ date: s.when, title: `Mai: ${s.title_vi}`, detail: s.detail_vi })));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'mai-kip-tet.ics';
    a.click();
  };
  const today = new Date().toISOString().slice(0, 10);
  const days = (iso: string) => Math.max(0, Math.ceil((new Date(`${iso}T00:00:00`).getTime() - Date.now()) / 86400000));
  const nextIdx = plan ? plan.steps.findIndex((st) => st.when >= today) : -1;
  return (
    <div className="mx-auto max-w-content pb-10">
      <BackHeader to="/tien-ich" title="Mai kịp Tết" />
      <div className="flex flex-col gap-4 px-gutter py-3">
        <label className="flex min-h-touch items-center gap-2 self-start rounded-full border border-line bg-surface pl-3 pr-2 text-caption font-medium shadow-card">
          <MapPin size={16} className="text-primary" aria-hidden="true" />
          <span className="sr-only">Tỉnh, thành</span>
          <select value={province} onChange={(e) => setProvince(e.target.value)} aria-label="Tỉnh, thành" className="min-h-touch bg-transparent pr-1">
            <option value="">Miền Nam (mặc định)</option>
            {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </label>
        {error ? <Notice tone="danger">{error}</Notice> : !plan ? <Skeleton className="h-64 rounded-card" /> : (
          <>
            <section className="theme-light relative overflow-hidden rounded-card bg-clay-soft p-4 shadow-card">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <div className="text-label font-semibold uppercase tracking-wider text-clay">Còn</div>
                  <div className="tabular text-[56px] font-semibold leading-none text-clay">{days(plan.tet)}</div>
                  <div className="text-caption font-medium text-ink">ngày tới Tết · mùng 1 là {vnDate(plan.tet)}</div>
                </div>
                <Flower2 size={64} strokeWidth={1.25} className="text-clay" aria-hidden="true" />
              </div>
              <div className="mt-4 rounded-btn bg-surface p-3">
                <div className="text-label text-ink-muted">Đợt tuốt lá{days(plan.defoliate_from) > 0 ? ` · còn ${days(plan.defoliate_from)} ngày` : ''}</div>
                <div className="tabular text-h1">{vnDate(plan.defoliate_from)} – {vnDate(plan.defoliate_to)}</div>
              </div>
            </section>
            <ol className="m-0 flex list-none flex-col p-0" aria-label="Các bước">
              {plan.steps.map((st, i) => {
                const past = st.when < today;
                const next = i === nextIdx;
                return (
                  <li key={st.when + st.title_vi} className="relative flex gap-3 pb-4 last:pb-0">
                    {i < plan.steps.length - 1 ? <span aria-hidden="true" className="absolute left-[11px] top-6 h-full w-0.5 bg-line" /> : null}
                    <span aria-hidden="true" className={cx('relative z-[1] mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full border-2',
                      past ? 'border-line-strong bg-surface-2' : next ? 'border-clay bg-clay' : 'border-clay bg-surface')}>
                      {past ? <Check size={12} className="text-ink-subtle" /> : null}
                    </span>
                    <span className={cx('flex flex-1 flex-col rounded-card border p-3', next ? 'border-clay bg-surface shadow-card' : 'border-line bg-surface', past && 'opacity-60')}>
                      <span className="flex items-baseline justify-between gap-2">
                        <span className="text-body font-semibold">{st.title_vi}</span>
                        <span className="tabular text-label font-semibold text-clay">{vnDate(st.when)}</span>
                      </span>
                      <span className="text-caption text-ink-muted">{st.detail_vi}</span>
                      {next ? <span className="mt-1 text-label font-semibold text-clay">Việc tiếp theo · còn {days(st.when)} ngày</span> : null}
                    </span>
                  </li>
                );
              })}
            </ol>
            <Button onClick={download}><CalendarPlus size={18} aria-hidden="true" />Thêm vào lịch điện thoại</Button>
            <p className="m-0 text-label text-ink-subtle">{plan.note_vi}</p>
          </>
        )}
      </div>
    </div>
  );
}
