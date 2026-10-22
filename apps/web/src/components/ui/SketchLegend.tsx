/** Ký hiệu bản vẽ — thống nhất với sketch SVG (docs/ui-spec.md). Mỗi ký hiệu có hình riêng, không chỉ dựa vào màu. */
const items = [
  { key: 'cut', label: 'Cắt bỏ', mark: <><line x1="2" y1="6" x2="22" y2="6" stroke="var(--seal)" strokeWidth="2.5" strokeDasharray="4 3" /><path d="m9 2 6 8m0-8-6 8" stroke="var(--seal)" strokeWidth="1.5" /></> },
  { key: 'keep', label: 'Giữ lại', mark: <line x1="2" y1="6" x2="22" y2="6" stroke="var(--leaf)" strokeWidth="3" strokeLinecap="round" /> },
  { key: 'new', label: 'Nuôi mới', mark: <><line x1="2" y1="6" x2="17" y2="6" stroke="var(--brass)" strokeWidth="3" strokeLinecap="round" /><path d="m16 2 6 4-6 4" fill="var(--brass)" /></> },
  { key: 'canopy', label: 'Khung tán', mark: <line x1="2" y1="6" x2="22" y2="6" stroke="var(--ink)" strokeWidth="1.25" strokeDasharray="3 2" /> },
  { key: 'apex', label: 'Ngọn', mark: <circle cx="12" cy="6" r="3.5" fill="var(--ink)" /> },
];

export function SketchLegend() {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-2 p-0 text-label text-ink-muted">
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-1.5">
          <svg width="24" height="12" viewBox="0 0 24 12" aria-hidden="true" fill="none">{it.mark}</svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}
