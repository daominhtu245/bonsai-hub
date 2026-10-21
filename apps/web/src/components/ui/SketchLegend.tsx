/** Ký hiệu bản vẽ — thống nhất với sketch SVG của P2 (docs/ui-spec.md). Mỗi ký hiệu có hình riêng, không chỉ dựa vào màu. */
const items = [
  { key: 'cut', label: 'Cành cắt bỏ', mark: <><line x1="2" y1="8" x2="30" y2="8" stroke="var(--seal)" strokeWidth="3" strokeDasharray="5 3" /><path d="m13 4 6 8m0-8-6 8" stroke="var(--seal)" strokeWidth="2" /></> },
  { key: 'keep', label: 'Cành giữ lại', mark: <line x1="2" y1="8" x2="30" y2="8" stroke="var(--leaf)" strokeWidth="4" strokeLinecap="round" /> },
  { key: 'new', label: 'Cành cần nuôi mới', mark: <><line x1="2" y1="8" x2="26" y2="8" stroke="var(--brass)" strokeWidth="4" strokeLinecap="round" /><path d="m22 3 7 5-7 5" fill="none" stroke="var(--brass)" strokeWidth="2" /></> },
  { key: 'canopy', label: 'Khung tán', mark: <line x1="2" y1="8" x2="30" y2="8" stroke="var(--ink)" strokeWidth="1.5" strokeDasharray="4 3" /> },
  { key: 'apex', label: 'Ngọn', mark: <circle cx="16" cy="8" r="5" fill="var(--ink)" /> },
];

export function SketchLegend() {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0 text-caption">
      {items.map((it) => (
        <li key={it.key} className="flex items-center gap-2.5">
          <svg width="32" height="16" viewBox="0 0 32 16" aria-hidden="true" fill="none">
            {it.mark}
          </svg>
          {it.label}
        </li>
      ))}
    </ul>
  );
}
