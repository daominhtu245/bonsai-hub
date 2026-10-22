/** Ảnh sản phẩm trang chủ: cây thật + lớp phân tích kiểu công cụ (khung tán, nhãn bộ phận). Không phải ảnh do AI tạo. */
const pins: Array<{ x: number; y: number; label: string; side?: 'left' | 'right' }> = [
  { x: 54, y: 4, label: 'Ngọn' },
  { x: 14, y: 36, label: 'Tầng tán 1', side: 'right' },
  { x: 62, y: 57, label: 'Thân · uốn nhẹ' },
  { x: 60, y: 88, label: 'Rễ nổi', side: 'left' },
];

export function HeroShot() {
  return (
    <figure className="relative m-0 overflow-hidden rounded-card border border-line bg-photo shadow-raised">
      <img src="/images/hero.webp" alt="Cây bonsai hoàn thiện, đánh dấu ngọn, tầng tán, thân và rễ" width={960} height={1260} className="block aspect-[4/5] w-full object-cover object-top" fetchPriority="high" />
      <svg className="theme-light pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 125" preserveAspectRatio="none" aria-hidden="true">
        <polygon points="54,2 1,52 97,47" fill="none" stroke="var(--surface)" strokeOpacity="0.85" strokeWidth="0.35" strokeDasharray="1.6 1.2" vectorEffect="non-scaling-stroke" />
      </svg>
      {pins.map((p) => (
        <span key={p.label} className="theme-light pointer-events-none absolute flex items-center gap-1.5" style={{ left: `${p.x}%`, top: `${p.y}%`, flexDirection: p.side === 'left' ? 'row-reverse' : 'row', transform: p.side === 'left' ? 'translateX(-100%)' : undefined }}>
          <span className="h-2.5 w-2.5 rounded-full border-2 border-surface bg-primary shadow-raised" />
          <span className="whitespace-nowrap rounded-chip bg-surface px-1.5 py-0.5 text-[11px] font-semibold text-ink shadow-raised">{p.label}</span>
        </span>
      ))}
    </figure>
  );
}
