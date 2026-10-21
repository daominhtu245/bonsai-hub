// Hình minh họa phôi si trước/sau (lấy từ mockup Main). Sản phẩm thật dùng ảnh người dùng và ảnh render.
export function RawTreeIllustration() {
  return (
    <svg viewBox="0 0 300 300" role="img" aria-label="Phôi si trước khi tạo dáng" className="theme-light">
      <rect width="300" height="300" fill="var(--photo-bg)" />
      <ellipse cx="150" cy="292" rx="70" ry="5" fill="var(--line-strong)" />
      <rect x="96" y="242" width="108" height="10" rx="3" fill="var(--ink-muted)" />
      <path d="M100 250 H200 L192 292 H108 Z" fill="var(--ink)" />
      <path d="M150 246 C147 230 140 218 136 200" fill="none" stroke="var(--bark)" strokeWidth="22" strokeLinecap="round" />
      <path d="M150 246 C146 222 126 204 134 176 C142 150 168 138 160 108 C156 92 150 80 152 60" fill="none" stroke="var(--bark)" strokeWidth="12" strokeLinecap="round" />
      <g stroke="var(--bark)" strokeWidth="5" strokeLinecap="round">
        <path d="M134 178 L78 158" /><path d="M140 166 L208 146" /><path d="M158 118 L106 98" />
        <path d="M160 108 L218 92" /><path d="M154 82 L186 56" /><path d="M152 62 L148 34" />
      </g>
      <g fill="var(--leaf)">
        <circle cx="78" cy="158" r="10" /><circle cx="68" cy="150" r="7" /><circle cx="208" cy="146" r="10" />
        <circle cx="218" cy="138" r="7" /><circle cx="106" cy="98" r="9" /><circle cx="218" cy="92" r="9" />
        <circle cx="186" cy="56" r="8" /><circle cx="148" cy="34" r="9" /><circle cx="138" cy="42" r="6" />
      </g>
    </svg>
  );
}

export function StyledTreeIllustration() {
  return (
    <svg viewBox="0 0 300 300" role="img" aria-label="Minh họa cây sau khoảng 5 năm tạo dáng" className="theme-light">
      <rect width="300" height="300" fill="var(--photo-bg)" />
      <ellipse cx="150" cy="282" rx="80" ry="5" fill="var(--line-strong)" />
      <rect x="78" y="244" width="144" height="9" rx="3" fill="var(--clay)" />
      <path d="M82 252 H218 L210 274 H90 Z" fill="var(--clay)" />
      <rect x="96" y="274" width="14" height="5" fill="var(--bark)" /><rect x="190" y="274" width="14" height="5" fill="var(--bark)" />
      <ellipse cx="150" cy="245" rx="60" ry="4" fill="var(--leaf)" />
      <path d="M150 246 C147 230 140 218 136 200" fill="none" stroke="var(--bark)" strokeWidth="26" strokeLinecap="round" />
      <path d="M150 246 C146 222 126 204 134 176 C142 150 168 138 160 108 C156 92 150 80 152 60" fill="none" stroke="var(--bark)" strokeWidth="14" strokeLinecap="round" />
      <g stroke="var(--bark)" strokeWidth="6" strokeLinecap="round">
        <path d="M134 178 L84 162" /><path d="M140 166 L200 150" /><path d="M158 118 L120 104" />
      </g>
      <g fill="var(--primary)">
        <ellipse cx="84" cy="156" rx="46" ry="15" /><ellipse cx="202" cy="142" rx="40" ry="14" />
        <ellipse cx="120" cy="98" rx="32" ry="12" /><ellipse cx="154" cy="62" rx="36" ry="20" />
      </g>
      <g fill="var(--leaf)">
        <ellipse cx="84" cy="150" rx="36" ry="8" /><ellipse cx="202" cy="136" rx="30" ry="7" />
        <ellipse cx="120" cy="93" rx="24" ry="6" /><ellipse cx="154" cy="54" rx="27" ry="10" />
      </g>
    </svg>
  );
}

export function SealLogo({ size = 32 }: { size?: number }) {
  return (
    <span className="flex items-center justify-center rounded-[6px] bg-seal" style={{ width: size, height: size }} aria-hidden="true">
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" fill="none" stroke="var(--surface)" strokeWidth="1.6" strokeLinecap="round">
        <path d="M12 20v-6c0-2-2-3-2-5" /><path d="M5 10c2-3 5-3 7-1 2-2 5-2 7 1-2 2-5 2-7 0-2 2-5 2-7 0z" /><path d="M7 20h10" />
      </svg>
    </span>
  );
}
