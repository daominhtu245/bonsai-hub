import { useEffect, useState } from 'react';
import { CalendarPlus } from 'lucide-react';
import { BackHeader } from '@/components/BackHeader';
import { Button, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
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
  useEffect(() => {
    setPlan(null);
    toolsApi.maiTet(province || null).then(setPlan).catch((e: ApiError) => setError(e.message));
  }, [province]);
  const download = () => {
    if (!plan) return;
    const ics = icsFor('Mai kịp Tết', plan.steps.map((s) => ({ date: s.when, title: `Mai: ${s.title_vi}`, detail: s.detail_vi })));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    a.download = 'mai-kip-tet.ics';
    a.click();
  };
  return (
    <div className="mx-auto max-w-content pb-10">
      <BackHeader to="/tien-ich" title="Mai kịp Tết" />
      <div className="flex flex-col gap-4 px-gutter py-4">
        <label className="flex flex-col gap-1 text-caption font-medium">Tỉnh, thành
          <select value={province} onChange={(e) => setProvince(e.target.value)} className="min-h-touch rounded-btn border border-line-strong bg-surface px-3 text-body">
            <option value="">Chọn tỉnh (mặc định miền Nam)</option>
            {provinces.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
          </select>
        </label>
        {error ? <Notice tone="danger">{error}</Notice> : !plan ? <Skeleton className="h-64 rounded-card" /> : (
          <>
            <div className="rounded-card border border-line bg-surface p-4 shadow-card">
              <div className="text-caption text-ink-muted">Mùng 1 Tết {vnDate(plan.tet)}</div>
              <div className="mt-1 text-[22px] font-semibold">Tuốt lá {vnDate(plan.defoliate_from)} – {vnDate(plan.defoliate_to)}</div>
            </div>
            <ol className="m-0 flex list-none flex-col gap-0 rounded-card border border-line bg-surface p-0 shadow-card">
              {plan.steps.map((s) => (
                <li key={s.when + s.title_vi} className="flex gap-3 border-b border-line px-4 py-3 last:border-0">
                  <span className="w-[52px] flex-none text-caption font-semibold tabular">{vnDate(s.when)}</span>
                  <span className="flex flex-col">
                    <span className="text-body font-medium">{s.title_vi}</span>
                    <span className="text-caption text-ink-muted">{s.detail_vi}</span>
                  </span>
                </li>
              ))}
            </ol>
            <Button onClick={download}><CalendarPlus size={18} aria-hidden="true" />Thêm vào lịch điện thoại</Button>
            <p className="m-0 text-label text-ink-subtle">{plan.note_vi}</p>
          </>
        )}
      </div>
    </div>
  );
}
