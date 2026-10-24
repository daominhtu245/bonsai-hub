import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { marketApi, type PotInput } from '@/lib/market';
import { DataTable, PageHeader, Panel, TableView, num, useAction, useConfirm, useLoad, vnd } from './kit';

const SHAPE_VI: Record<string, string> = { rectangle: 'Chữ nhật', oval: 'Bầu dục', round: 'Tròn', cascade_deep: 'Sâu (huyền)' };
const COLOR_VI: Record<string, string> = { unglazed_brown: 'Nâu mộc', glazed_blue: 'Men lam', glazed_cream: 'Men kem' }; // cùng bộ màu với thiết kế (lib/studio.ts PotColor)

/** C7 — Chậu của xưởng đối tác: gợi ý ở Kết quả → Chậu hợp dáng (cùng dáng, cỡ ≈ 2/3 chiều cao cây). */
export default function PartnerPotsAdmin() {
  const [state, reload] = useLoad(() => marketApi.adminPots());
  const [confirm, dialog] = useConfirm();
  const [run, notice, busy] = useAction();
  const create = async () => {
    const r = await confirm({
      title: 'Thêm chậu đối tác', confirmLabel: 'Thêm',
      fields: [
        { name: 'name', label: 'Tên chậu', required: true },
        { name: 'maker', label: 'Xưởng (Bát Tràng…)' },
        { name: 'shape', label: 'Dáng', required: true, defaultValue: 'oval', options: Object.entries(SHAPE_VI) },
        { name: 'color', label: 'Màu', options: Object.entries(COLOR_VI) },
        { name: 'length_cm', label: 'Dài (cm)', type: 'number' },
        { name: 'price_vnd', label: 'Giá (đ)', type: 'number' },
        { name: 'url', label: 'Link mua (https://…, có mã giới thiệu)' },
        { name: 'image_url', label: 'Link ảnh (https://…)' },
      ],
    });
    if (!r) return;
    const v = r.values;
    const body: PotInput = {
      name: v.name.trim(), maker: v.maker.trim() || null, shape: v.shape, color: v.color || null,
      length_cm: v.length_cm ? Number(v.length_cm) : null, price_vnd: v.price_vnd ? Number(v.price_vnd) : null,
      url: v.url.trim() || null, image_url: v.image_url.trim() || null, active: true,
    };
    await run(async () => { await marketApi.createPot(body); reload(); }, 'Đã thêm chậu.');
  };
  return (
    <>
      <PageHeader title="Chậu đối tác" sub="Gợi ý cho người dùng theo dáng và cỡ cây; link mua có mã giới thiệu"
        actions={<Button size="touch" block={false} onClick={create} disabled={busy}><Plus size={16} aria-hidden="true" />Thêm chậu</Button>} />
      {notice}
      <Panel pad={false}>
        <TableView state={state}>
          {(rows) => (
            <DataTable rows={rows} rowKey={(p) => String(p.id)} empty="Chưa có chậu nào."
              columns={[
                { key: 'n', header: 'Tên', render: (p) => <span className="font-medium">{p.name}</span> },
                { key: 'm', header: 'Xưởng', render: (p) => p.maker ?? '—' },
                { key: 's', header: 'Dáng', render: (p) => SHAPE_VI[p.shape] ?? p.shape },
                { key: 'l', header: 'Dài', align: 'right', render: (p) => (p.length_cm ? `${num(p.length_cm)} cm` : '—') },
                { key: 'v', header: 'Giá', align: 'right', render: (p) => (p.price_vnd ? vnd(p.price_vnd) : '—') },
                { key: 'on', header: 'Bật', render: (p) => (
                  <input type="checkbox" role="switch" className="switch" checked={p.active} aria-label={`Bật chậu ${p.name}`}
                    onChange={(e) => run(async () => { const { id, ...rest } = p; await marketApi.updatePot(id, { ...rest, active: e.target.checked }); reload(); }, 'Đã lưu.')} />
                ) },
                { key: 'x', header: '', render: (p) => (
                  <button type="button" aria-label={`Xóa ${p.name}`} onClick={() => run(async () => { await marketApi.deletePot(p.id); reload(); }, 'Đã xóa.')}
                    className="flex h-touch w-touch items-center justify-center text-ink-muted hover:text-danger"><Trash2 size={16} aria-hidden="true" /></button>
                ) },
              ]} />
          )}
        </TableView>
      </Panel>
      {dialog}
    </>
  );
}
