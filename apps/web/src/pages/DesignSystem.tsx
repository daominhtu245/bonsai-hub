import { useState, type ReactNode } from 'react';
import { RawTreeIllustration, SealLogo, StyledTreeIllustration } from '@/components/illustrations/Bonsai';
import {
  BeforeAfterSlider,
  Button,
  Card,
  Chip,
  EmptyState,
  FilterChip,
  GuideCard,
  Notice,
  Skeleton,
  SketchLegend,
  StageTimeline,
  StateView,
  StyleName,
  type ViewState,
} from '@/components/ui';
import { sampleGuides, sampleTabs } from './sampleStages';

const swatches = [
  ['Giấy dó', 'bg'], ['Giấy ngà', 'surface'], ['Mực tàu', 'ink'], ['Tro bếp', 'ink-muted'], ['Rêu đậm', 'primary'],
  ['Rêu non', 'primary-soft'], ['Vỏ thông', 'bark'], ['Gốm nung', 'clay'], ['Đỏ son', 'seal'], ['Đồng thau', 'brass'],
  ['Lá xanh', 'leaf'], ['Nghệ', 'warn'], ['Son sẫm', 'danger'], ['Nền ảnh', 'photo-bg'],
] as const;

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-h2">{title}</h2>
      {children}
    </section>
  );
}

/** Thư viện component (tương ứng design/mockups/Tokens.dc.html). Dùng khi phát triển, không có trong luồng chính. */
export default function DesignSystem() {
  const [stage, setStage] = useState(1);
  const [done, setDone] = useState<Record<number, Set<number>>>({});
  const [filter, setFilter] = useState('si');
  const [demo, setDemo] = useState<ViewState<string>['status']>('ready');

  const demoState: ViewState<string> =
    demo === 'loading' ? { status: 'loading' }
      : demo === 'empty' ? { status: 'empty' }
        : demo === 'error' ? { status: 'error', message: 'Không tải được vườn của bạn. Kiểm tra mạng rồi thử lại.', retry: () => setDemo('ready') }
          : { status: 'ready', data: 'Si gốc lũa sân sau' };

  const toggle = (i: number) =>
    setDone((prev) => {
      const s = new Set(prev[stage]);
      if (s.has(i)) s.delete(i);
      else s.add(i);
      return { ...prev, [stage]: s };
    });

  return (
    <div className="mx-auto flex max-w-content flex-col gap-8 px-gutter py-6">
      <header className="flex items-center gap-4">
        <SealLogo size={48} />
        <div>
          <h1 className="text-display">Rêu &amp; Gốm</h1>
          <span className="text-ink-muted">Hệ thống thiết kế Bonsai AI · v0.1</span>
        </div>
      </header>

      <Block title="Màu">
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
          {swatches.map(([name, token]) => (
            <div key={token} className="flex flex-col gap-1">
              <div className="h-14 rounded-img border border-line-strong" style={{ background: `var(--${token})` }} />
              <span className="text-caption font-semibold">{name}</span>
              <span className="font-mono text-label text-ink-muted">{token}</span>
            </div>
          ))}
        </div>
        <p className="m-0 text-caption text-ink-muted">Tỉ lệ dùng: 80% giấy + mực · 15% rêu, vỏ, gốm · tối đa 5% đỏ son</p>
      </Block>

      <Block title="Chữ">
        <div className="text-display font-display font-semibold">Phôi hôm nay, dáng cây mai sau.</div>
        <div className="text-h1 font-display font-semibold">Tiêu đề 24</div>
        <div className="text-h2 font-display font-semibold">Tiêu đề 20</div>
        <p className="m-0">Be Vietnam Pro 17 px cho nội dung: đọc rõ ngoài vườn, đủ dấu tiếng Việt.</p>
        <p className="m-0 text-caption text-ink-muted">Chú thích 14 · nhãn 13</p>
      </Block>

      <Block title="Nút">
        <Button>Nút chính</Button>
        <Button variant="secondary">Nút phụ</Button>
        <Button loading>Không hiện</Button>
        <span className="text-label text-ink-muted">Cao 52 · bo 10 · rộng hết cột trên điện thoại</span>
      </Block>

      <Block title="Chip">
        <div className="flex flex-wrap gap-2">
          <Chip tone="soft">1 lượt miễn phí</Chip>
          <Chip tone="species">Si</Chip>
          <Chip>
            <StyleName vi="Xiêu" jp="Shakan" />
          </Chip>
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc theo loài">
          {[['si', 'Si'], ['sanh', 'Sanh'], ['mai_chieu_thuy', 'Mai chiếu thủy']].map(([k, label]) => (
            <FilterChip key={k} selected={filter === k} onClick={() => setFilter(k)}>
              {label}
            </FilterChip>
          ))}
        </div>
      </Block>

      <Block title="Thông báo">
        <Notice tone="warn">Độ tin cậy thấp: ảnh hơi tối, nên chụp lại</Notice>
        <Notice tone="danger">Tạo ảnh lỗi. Đã hoàn lượt cho bạn.</Notice>
        <Notice tone="success">Đã nhận 199.000 đ · cộng 5 lượt</Notice>
      </Block>

      <Block title="Ký hiệu bản vẽ">
        <SketchLegend />
      </Block>

      <Block title="Thanh trượt trước/sau">
        <BeforeAfterSlider before={<RawTreeIllustration />} after={<StyledTreeIllustration />} beforeLabel="Phôi si · hôm nay" afterLabel="Minh họa sau ~5 năm" />
      </Block>

      <Block title="Timeline giai đoạn + thẻ hướng dẫn">
        <StageTimeline stages={sampleTabs} current={stage} onSelect={setStage} />
        <GuideCard guide={sampleGuides[stage]} done={done[stage] ?? new Set()} onToggle={toggle} />
      </Block>

      <Block title="Bốn trạng thái">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Chọn trạng thái">
          {(['loading', 'empty', 'error', 'ready'] as const).map((s) => (
            <FilterChip key={s} selected={demo === s} onClick={() => setDemo(s)}>
              {{ loading: 'Đang tải', empty: 'Rỗng', error: 'Lỗi', ready: 'Bình thường' }[s]}
            </FilterChip>
          ))}
        </div>
        <StateView
          state={demoState}
          skeleton={
            <Card className="flex gap-3">
              <Skeleton className="h-20 w-20" />
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            </Card>
          }
          empty={<EmptyState title="Vườn còn trống" body="Chụp phôi đầu tiên để bắt đầu lộ trình." action={<Button block={false}>Chụp phôi</Button>} />}
        >
          {(name) => (
            <Card className="flex gap-3">
              <div className="h-20 w-20 overflow-hidden rounded-img">
                <RawTreeIllustration />
              </div>
              <div>
                <div className="font-semibold">{name}</div>
                <div className="text-caption text-ink-muted">Giai đoạn S1 · Tạo khung</div>
              </div>
            </Card>
          )}
        </StateView>
      </Block>
    </div>
  );
}
