import { useState } from 'react';
import { CalendarPlus, FileSpreadsheet, Printer } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Notice } from '@/components/ui';
import { accountApi } from '@/lib/account';
import { ApiError } from '@/lib/api';

const row = 'flex min-h-[56px] w-full items-center gap-3 px-4 text-left text-caption font-medium text-ink no-underline hover:bg-surface-2 hover:text-ink disabled:opacity-50';

/** Lưu lộ trình ra ngoài app: Excel để in / đánh dấu, lịch điện thoại để được nhắc, trang in / PDF. */
export function SaveAndRemind({ jobId }: { jobId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const open = async (kind: 'xlsx' | 'ics') => {
    setBusy(kind);
    setError(null);
    try {
      const links = await accountApi.exportLinks(jobId);
      window.location.href = kind === 'xlsx' ? links.xlsx_url : links.ics_url; // .ics mở thẳng ứng dụng Lịch
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section className="mx-gutter mt-4" aria-labelledby="save-title">
      <h2 id="save-title" className="eyebrow mb-2 px-1">Lưu & nhắc việc</h2>
      <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface shadow-card">
        <button type="button" className={row} onClick={() => open('ics')} disabled={busy !== null}>
          <CalendarPlus size={20} strokeWidth={1.75} className="flex-none text-primary" aria-hidden="true" />
          <span className="flex-1">{busy === 'ics' ? 'Đang mở…' : 'Thêm nhắc việc vào lịch điện thoại'}</span>
        </button>
        <button type="button" className={row} onClick={() => open('xlsx')} disabled={busy !== null}>
          <FileSpreadsheet size={20} strokeWidth={1.75} className="flex-none text-primary" aria-hidden="true" />
          <span className="flex-1">{busy === 'xlsx' ? 'Đang tải…' : 'Tải lịch chăm sóc (Excel)'}</span>
        </button>
        <Link to={`/ket-qua/${jobId}/in`} className={row}>
          <Printer size={20} strokeWidth={1.75} className="flex-none text-primary" aria-hidden="true" />
          <span className="flex-1">In hướng dẫn / Lưu PDF</span>
        </Link>
      </div>
      {error ? <div className="mt-2"><Notice tone="danger">{error}</Notice></div> : null}
    </section>
  );
}
