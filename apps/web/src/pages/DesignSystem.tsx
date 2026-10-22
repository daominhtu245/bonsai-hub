import { useState, type ReactNode } from 'react';
import { Camera } from 'lucide-react';
import { BackHeader } from '@/components/BackHeader';
import { BrandMark } from '@/components/BrandMark';
import {
  BeforeAfterSlider, Button, Card, Chip, EmptyState, FilterChip, GuideCard, Notice, Segmented, Skeleton, SketchLegend,
  StageTimeline, StateView, StepList, StyleName, type ViewState,
} from '@/components/ui';
import { sampleGuides, sampleTabs } from './sampleStages';

const COLORS = ['bg', 'surface', 'surface-2', 'line', 'line-strong', 'ink', 'ink-muted', 'ink-subtle', 'primary', 'primary-soft', 'warn', 'danger', 'seal', 'leaf', 'brass'] as const;

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="eyebrow">{title}</h2>
      {children}
    </section>
  );
}

/** Thư viện component — hệ thiết kế v2 (design/tokens.json). Dùng khi phát triển. */
export default function DesignSystem() {
  const [stage, setStage] = useState(1);
  const [done, setDone] = useState<Record<number, Set<number>>>({});
  const [seg, setSeg] = useState<'a' | 'b'>('a');
  const [filter, setFilter] = useState('si');
  const [demo, setDemo] = useState<ViewState<string>['status']>('ready');
  const demoState: ViewState<string> =
    demo === 'loading' ? { status: 'loading' } : demo === 'empty' ? { status: 'empty' }
      : demo === 'error' ? { status: 'error', message: 'Không tải được dữ liệu.', retry: () => setDemo('ready') } : { status: 'ready', data: 'Si gốc lũa sân sau' };
  const toggle = (i: number) => setDone((prev) => {
    const s = new Set(prev[stage]);
    if (s.has(i)) s.delete(i);
    else s.add(i);
    return { ...prev, [stage]: s };
  });

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/" title="Hệ thống thiết kế" right="v2.0" />
      <main className="flex flex-col gap-8 px-gutter py-6">
        <div className="flex items-center gap-3">
          <BrandMark size={40} />
          <div>
            <div className="text-h1">Bonsai AI</div>
            <div className="text-caption text-ink-muted">Trung tính · một màu nhấn · Be Vietnam Pro</div>
          </div>
        </div>

        <Block title="Màu">
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
            {COLORS.map((c) => (
              <div key={c} className="flex flex-col gap-1">
                <div className="h-10 rounded-btn border border-line" style={{ background: `var(--${c})` }} />
                <span className="font-mono text-label text-ink-muted">{c}</span>
              </div>
            ))}
          </div>
        </Block>

        <Block title="Chữ">
          <div className="text-display">Hiển thị 28</div>
          <div className="text-h1">Tiêu đề 22</div>
          <div className="text-h2">Tiêu đề 17</div>
          <p className="m-0">Nội dung 16 — đủ dấu tiếng Việt, đọc rõ ngoài trời.</p>
          <p className="m-0 text-caption text-ink-muted">Phụ 14</p>
          <p className="eyebrow m-0">Nhãn mục 12</p>
        </Block>

        <Block title="Nút">
          <Button><Camera size={18} strokeWidth={2} aria-hidden="true" />Nút chính</Button>
          <Button variant="secondary">Nút phụ</Button>
          <Button loading>Không hiện</Button>
          <div className="flex gap-2"><Button variant="ghost" size="touch" block={false}>Ghost</Button><Button variant="danger" size="touch" block={false}>Xóa</Button></div>
        </Block>

        <Block title="Nhãn & chọn">
          <div className="flex flex-wrap gap-1.5">
            <Chip>Trung tính</Chip><Chip tone="success">Đã xong</Chip><Chip tone="warn">Độ tin cậy thấp</Chip><Chip tone="outline"><StyleName vi="Xiêu" jp="Shakan" /></Chip>
          </div>
          <Segmented<'a' | 'b'> label="Ví dụ" value={seg} onChange={setSeg} options={[['a', 'Bản vẽ'], ['b', 'Ảnh gốc']]} />
          <div className="flex flex-wrap gap-2">
            {[['si', 'Si'], ['sanh', 'Sanh'], ['mai', 'Mai chiếu thủy']].map(([k, l]) => <FilterChip key={k} selected={filter === k} onClick={() => setFilter(k)}>{l}</FilterChip>)}
          </div>
        </Block>

        <Block title="Thông báo">
          <Notice tone="info">Thông tin trung tính</Notice>
          <Notice tone="success">Đã nhận 199.000 đ · cộng 5 lượt</Notice>
          <Notice tone="warn">Độ tin cậy thấp</Notice>
          <Notice tone="danger">Tạo ảnh chưa thành công. Đã hoàn lượt cho bạn.</Notice>
        </Block>

        <Block title="Tiến trình">
          <Card><StepList steps={[{ key: 'a', state: 'done', label: 'Nhận diện loài' }, { key: 'b', state: 'current', label: 'Xét các cành' }, { key: 'c', state: 'pending', label: 'Đề xuất thế' }]} /></Card>
        </Block>

        <Block title="Ký hiệu bản vẽ"><SketchLegend /></Block>

        <Block title="So sánh ảnh">
          <BeforeAfterSlider before={<img src="/images/pine.webp" alt="Ví dụ trước" />} after={<img src="/images/hero.webp" alt="Ví dụ sau" />} beforeLabel="Trước" afterLabel="Sau" />
        </Block>

        <Block title="Giai đoạn + hướng dẫn">
          <StageTimeline stages={sampleTabs} current={stage} onSelect={setStage} />
          <GuideCard guide={sampleGuides[stage]} done={done[stage] ?? new Set()} onToggle={toggle} />
        </Block>

        <Block title="Bốn trạng thái">
          <div className="flex flex-wrap gap-2">
            {(['loading', 'empty', 'error', 'ready'] as const).map((s) => <FilterChip key={s} selected={demo === s} onClick={() => setDemo(s)}>{{ loading: 'Đang tải', empty: 'Rỗng', error: 'Lỗi', ready: 'Bình thường' }[s]}</FilterChip>)}
          </div>
          <StateView state={demoState} skeleton={<Skeleton className="h-20 rounded-card" />} empty={<EmptyState image="/images/cutout.webp" title="Chưa có cây nào" />}>
            {(name) => <Card className="font-medium">{name}</Card>}
          </StateView>
        </Block>
      </main>
    </div>
  );
}
