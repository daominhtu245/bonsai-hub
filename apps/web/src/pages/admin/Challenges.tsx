import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { communityApi } from '@/lib/community';
import { Badge, DataTable, PageHeader, Panel, TableView, dt, num, useAction, useConfirm, useLoad } from './kit';

const STATE: Record<string, [string, 'neutral' | 'success' | 'warn']> = { upcoming: ['Sắp mở', 'warn'], open: ['Đang mở', 'success'], closed: ['Đã đóng', 'neutral'] };

/** B4 — Quản trị thử thách phôi hằng tháng. Phôi phải do tài khoản quản trị / nghệ nhân tải lên (ảnh sẽ công khai). */
export default function ChallengesAdmin() {
  const [state, reload] = useLoad(() => communityApi.adminChallenges());
  const [confirm, dialog] = useConfirm();
  const [run, notice, busy] = useAction();
  const create = async () => {
    const r = await confirm({
      title: 'Tạo thử thách', confirmLabel: 'Tạo',
      body: 'Dùng mã phiên của một phôi đã phân tích xong, do tài khoản quản trị hoặc nghệ nhân tải lên.',
      fields: [
        { name: 'title', label: 'Tên thử thách', required: true, placeholder: 'Thử thách si tháng 11' },
        { name: 'job_id', label: 'Mã phiên phôi', required: true },
        { name: 'prize', label: 'Giải thưởng (nhà vườn tài trợ…)' },
        { name: 'start', label: 'Bắt đầu sau (ngày, 0 = ngay)', type: 'number', defaultValue: '0' },
        { name: 'days', label: 'Kéo dài (ngày)', type: 'number', required: true, defaultValue: '21' },
      ],
      note: { label: 'Mô tả ngắn' },
    });
    if (!r) return;
    const start = new Date(Date.now() + Number(r.values.start || 0) * 86400000);
    const end = new Date(start.getTime() + Number(r.values.days) * 86400000);
    await run(async () => {
      await communityApi.createChallenge({
        title: r.values.title.trim(), job_id: r.values.job_id.trim(), prize: r.values.prize.trim() || undefined,
        description: r.note || undefined, starts_at: start.toISOString(), ends_at: end.toISOString(),
      });
      reload();
    }, 'Đã tạo thử thách.');
  };
  const remove = async (id: string, title: string) => {
    const r = await confirm({ title: 'Xóa thử thách', body: `Xóa "${title}" cùng toàn bộ bài dự thi và phiếu bầu?`, confirmLabel: 'Xóa', danger: true });
    if (r) await run(async () => { await communityApi.deleteChallenge(id); reload(); }, 'Đã xóa.');
  };
  return (
    <>
      <PageHeader title="Thử thách phôi" sub="Cùng một phôi, người chơi tự thiết kế, cộng đồng bình chọn"
        actions={<Button size="touch" block={false} onClick={create} disabled={busy}><Plus size={16} aria-hidden="true" />Tạo thử thách</Button>} />
      {notice}
      <Panel pad={false}>
        <TableView state={state}>
          {(rows) => (
            <DataTable rows={rows} rowKey={(c) => c.id} empty="Chưa có thử thách."
              columns={[
                { key: 't', header: 'Tên', render: (c) => <span className="font-medium">{c.title}</span> },
                { key: 's', header: 'Trạng thái', render: (c) => <Badge tone={STATE[c.state][1]}>{STATE[c.state][0]}</Badge> },
                { key: 'from', header: 'Từ', render: (c) => dt(c.starts_at) },
                { key: 'to', header: 'Đến', render: (c) => dt(c.ends_at) },
                { key: 'n', header: 'Bài', align: 'right', render: (c) => num(c.entries) },
                { key: 'p', header: 'Giải', className: 'hidden 2xl:table-cell', render: (c) => <span className="text-ink-muted">{c.prize ?? '—'}</span> },
                { key: 'x', header: '', render: (c) => (
                  <button type="button" aria-label={`Xóa ${c.title}`} onClick={() => remove(c.id, c.title)} className="flex h-touch w-touch items-center justify-center text-ink-muted hover:text-danger">
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                ) },
              ]} />
          )}
        </TableView>
      </Panel>
      {dialog}
    </>
  );
}
