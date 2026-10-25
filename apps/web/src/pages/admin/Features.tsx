import { useEffect, useState } from 'react';
import { Button, FilterChip, Notice } from '@/components/ui';
import { adminCommunityApi, type FeatureRow, type FeatureState, type FeaturesAdmin } from '@/lib/adminCommunity';
import { cx } from '@/lib/cx';
import { PageHeader, Panel, SearchBox, TableView, num, useAction, useLoad } from './kit';

const STATES: Array<[FeatureState, string]> = [['on', 'Mở'], ['staff', 'Nội bộ'], ['off', 'Tắt']];
const TONE: Record<FeatureState, string> = { on: 'bg-primary text-primary-on', staff: 'bg-warn-soft text-warn-ink', off: 'bg-surface-2 text-ink' };

function StateSwitch({ row, onChange, disabled }: { row: FeatureRow; onChange: (s: FeatureState) => void; disabled: boolean }) {
  return (
    <div role="radiogroup" aria-label={row.label_vi} className="inline-flex rounded-btn border border-line p-0.5">
      {STATES.map(([s, label]) => (
        <button key={s} type="button" role="radio" aria-checked={row.state === s} disabled={disabled} onClick={() => row.state !== s && onChange(s)}
          className={cx('min-h-[36px] min-w-[64px] rounded-[6px] px-2 text-label font-semibold', row.state === s ? TONE[s] : 'text-ink-muted hover:text-ink')}>
          {label}
        </button>
      ))}
    </div>
  );
}

/** Bật / tắt tính năng người dùng. "Nội bộ": chỉ quản trị, nghệ nhân và email trong danh sách người thử — để chạy thử trước khi mở. */
export default function FeaturesPage() {
  const [state, reload, set] = useLoad(() => adminCommunityApi.features());
  const [run, notice, busy] = useAction();
  const [testers, setTesters] = useState('');
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<FeatureState | ''>('');
  const data = state.status === 'ready' ? state.data : null;
  useEffect(() => { if (data) setTesters(data.testers.join('\n')); }, [data?.testers.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const apply = (body: Parameters<typeof adminCommunityApi.saveFeatures>[0], ok: string) =>
    run(async () => set(await adminCommunityApi.saveFeatures(body)), ok);
  const bulk = (s: FeatureState) => data && apply({ flags: Object.fromEntries(data.items.map((i) => [i.key, s])) }, 'Đã đổi tất cả.');
  return (
    <>
      <PageHeader title="Tính năng" sub="Mở dần từng tính năng cho người dùng; Nội bộ = chạy thử với quản trị, nghệ nhân, người thử"
        actions={data ? <div className="flex gap-2"><Button size="touch" variant="secondary" block={false} onClick={() => bulk('staff')} disabled={busy}>Tất cả nội bộ</Button>
          <Button size="touch" block={false} onClick={() => bulk('on')} disabled={busy}>Mở tất cả</Button></div> : null} />
      {notice}
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <TableView state={state}>
          {(d: FeaturesAdmin) => {
            const count = (s: FeatureState) => d.items.filter((i) => i.state === s).length;
            const norm = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
            const items = d.items.filter((i) => (!only || i.state === only) && (!q || norm(i.label_vi + i.group_vi).includes(norm(q))));
            return (
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Lọc theo trạng thái">
                {([['', `Tất cả ${d.items.length}`], ...STATES.map(([s, l]) => [s, `${l} ${count(s)}`])] as Array<[FeatureState | '', string]>).map(([s, l]) => (
                  <FilterChip key={s || 'all'} selected={only === s} onClick={() => setOnly(s)}>
                    {s ? <span aria-hidden="true" className={cx('h-2.5 w-2.5 rounded-full', s === 'on' ? 'bg-primary' : s === 'staff' ? 'bg-warn' : 'bg-line-strong')} /> : null}
                    {l}
                  </FilterChip>
                ))}
                <SearchBox value={q} onChange={setQ} placeholder="Tìm tính năng" />
              </div>
              {items.length === 0 ? <Panel><span className="text-caption text-ink-muted">Không có tính năng phù hợp.</span></Panel> : null}
              {[...new Set(items.map((i) => i.group_vi))].map((g) => (
                <Panel key={g} title={g} pad={false}>
                  <ul className="m-0 list-none divide-y divide-line p-0">
                    {items.filter((i) => i.group_vi === g).map((i) => (
                      <li key={i.key} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                        <span className="flex min-w-[200px] flex-1 flex-col">
                          <span className="text-caption font-medium">{i.label_vi}</span>
                          <span className="text-label text-ink-subtle">{i.usage_30d == null ? '—' : `${num(i.usage_30d)} lượt dùng / 30 ngày`}</span>
                        </span>
                        <StateSwitch row={i} disabled={busy} onChange={(s) => apply({ flags: { [i.key]: s } }, `${i.label_vi}: ${STATES.find(([x]) => x === s)![1]}.`)} />
                      </li>
                    ))}
                  </ul>
                </Panel>
              ))}
            </div>
            );
          }}
        </TableView>
        <Panel title="Người thử" className="xl:self-start">
          <div className="flex flex-col gap-2">
            <span className="text-label text-ink-muted">Mỗi dòng một email. Thấy các tính năng "Nội bộ" như quản trị.</span>
            <textarea rows={8} value={testers} onChange={(e) => setTesters(e.target.value)} aria-label="Email người thử"
              className="rounded-btn border border-line-strong bg-surface p-2 font-mono text-caption" />
            <Button size="touch" variant="secondary" disabled={busy || !data} onClick={() => apply({ testers: testers.split(/[\n,]/) }, 'Đã lưu người thử.')}>Lưu người thử</Button>
            <Notice tone="info">Người dùng thấy thay đổi khi mở lại app (không cần đăng xuất).</Notice>
          </div>
        </Panel>
      </div>
      {state.status === 'error' ? <Button variant="secondary" onClick={reload}>Tải lại</Button> : null}
    </>
  );
}
