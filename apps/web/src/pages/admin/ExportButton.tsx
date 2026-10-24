import { useState } from 'react';
import { FileSpreadsheet } from 'lucide-react';
import { Button } from '@/components/ui';
import { downloadExport } from '@/lib/adminConsole';
import { ApiError } from '@/lib/api';

/** Xuất danh sách đang xem (theo bộ lọc hiện tại) ra Excel, tối đa 10.000 dòng. */
export function ExportButton({ kind, params }: { kind: 'jobs' | 'users' | 'payments'; params: Record<string, string> }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end">
      <Button variant="secondary" size="touch" block={false} loading={busy} loadingLabel="Đang xuất…"
        onClick={async () => {
          setBusy(true);
          setErr(null);
          try {
            await downloadExport(kind, params);
          } catch (e) {
            setErr((e as ApiError).message);
          } finally {
            setBusy(false);
          }
        }}>
        <FileSpreadsheet size={16} aria-hidden="true" />Xuất Excel
      </Button>
      {err ? <span className="mt-1 text-label text-danger">{err}</span> : null}
    </span>
  );
}
