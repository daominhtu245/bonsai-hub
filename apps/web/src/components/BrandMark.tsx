import { Sprout } from 'lucide-react';

/** Biểu tượng thương hiệu: ô vuông bo nhẹ màu chủ đạo + icon mầm. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <span className="flex flex-none items-center justify-center rounded-[7px] bg-primary text-primary-on" style={{ width: size, height: size }} aria-hidden="true">
      <Sprout size={size * 0.6} strokeWidth={2} />
    </span>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2">
      <BrandMark />
      <span className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Bonsai AI</span>
    </span>
  );
}
