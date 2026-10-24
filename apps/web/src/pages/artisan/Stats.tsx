import { Skeleton, StateView } from '@/components/ui';
import { artisanApi, type KindStats } from '@/lib/artisan';
import { CRITERION_LABEL, termLabel } from '@/lib/ruleLabels';
import { DataTable, PageHeader, Panel, StatCard, pct, useLoad } from '../admin/kit';

const GATE = 0.7; // Cổng 2: ≥ 70% ảnh đạt ngay vòng đầu (CLAUDE.md)

function rate(s: KindStats) {
  return s.pass_rate === null ? '—' : pct(s.pass_rate);
}

/** Thống kê chấm của nghệ nhân: tỉ lệ đạt (Cổng 1 thiết kế, Cổng 2 ảnh), điểm theo tiêu chí, độ khớp với AI chấm. */
export default function StatsPage() {
  const [state] = useLoad(artisanApi.stats);
  return (
    <div>
      <PageHeader title="Thống kê chấm" sub="Cổng 1: thiết kế hợp lý · Cổng 2: ≥ 70% ảnh đạt ngay vòng đầu" />
      <StateView state={state} skeleton={<Skeleton className="h-80 rounded-card" />} empty={null}>
        {(s) => {
          const rows = Object.keys({ ...s.image.by_criterion, ...s.design.by_criterion });
          const ai = s.image.ai_agreement;
          return (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
                <StatCard label="Ảnh đã chấm" value={s.image.count} format={String} hint={`${s.image.targets} ảnh`} />
                <StatCard label="Ảnh đạt" value={s.image.pass_rate ?? 0} format={() => rate(s.image)} hint={`mục tiêu ${pct(GATE)}`} />
                <StatCard label="Thiết kế đã chấm" value={s.design.count} format={String} hint={`${s.design.targets} phương án`} />
                <StatCard label="Thiết kế đạt" value={s.design.pass_rate ?? 0} format={() => rate(s.design)} />
                <StatCard label="Khớp kết luận với AI" value={ai?.same_verdict ?? 0} format={() => (ai?.same_verdict == null ? '—' : pct(ai.same_verdict))} hint={`${ai?.pairs ?? 0} ảnh`} />
                <StatCard label="Lệch điểm với AI" value={ai?.mean_abs_diff ?? 0} format={() => (ai?.mean_abs_diff == null ? '—' : `${ai.mean_abs_diff} điểm`)} goodWhen="down" />
              </div>
              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="Điểm trung bình theo tiêu chí (1–10)" pad={false}>
                  <DataTable rowKey={(k) => k} rows={rows} columns={[
                    { key: 'c', header: 'Tiêu chí', render: (k) => CRITERION_LABEL[k] ?? termLabel(k) },
                    { key: 'i', header: 'Ảnh', align: 'right', render: (k) => s.image.by_criterion[k]?.avg ?? '—' },
                    { key: 'd', header: 'Thiết kế', align: 'right', render: (k) => s.design.by_criterion[k]?.avg ?? '—' },
                  ]} />
                </Panel>
                <Panel title="Lỗi hay gặp" pad={false}>
                  <DataTable rowKey={(r) => r[0]} rows={[...s.image.hard_fails.map((f) => ['Ảnh', ...f] as const), ...s.design.hard_fails.map((f) => ['Thiết kế', ...f] as const)]}
                    empty="Chưa có lỗi nào được ghi." columns={[
                      { key: 'k', header: 'Loại', render: (r) => r[0] },
                      { key: 'f', header: 'Lỗi', render: (r) => termLabel(r[1]) },
                      { key: 'n', header: 'Số lần', align: 'right', render: (r) => r[2] },
                    ]} />
                </Panel>
              </div>
              <Panel title="Người chấm" pad={false}>
                <DataTable rowKey={(r) => r.name} rows={s.reviewers} empty="Chưa có ai chấm." columns={[
                  { key: 'n', header: 'Tên', render: (r) => r.name },
                  { key: 'c', header: 'Đã chấm', align: 'right', render: (r) => r.count },
                ]} />
              </Panel>
            </div>
          );
        }}
      </StateView>
    </div>
  );
}
