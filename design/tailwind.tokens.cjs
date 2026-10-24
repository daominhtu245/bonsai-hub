// Tailwind preset — hệ thống thiết kế Bonsai AI v2 (kiểu công cụ chuyên nghiệp: trung tính, một màu nhấn, một font sans).
// Màu dùng CSS variables sinh từ design/tokens.json (apps/web/scripts/gen-tokens.mjs) để đổi sáng/tối.

const v = (name) => `var(--${name})`;
const sans = ['"Be Vietnam Pro"', 'system-ui', '-apple-system', '"Segoe UI"', 'sans-serif'];

module.exports = {
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: { DEFAULT: v('surface'), 2: v('surface-2') },
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        ink: { DEFAULT: v('ink'), muted: v('ink-muted'), subtle: v('ink-subtle') },
        primary: { DEFAULT: v('primary'), ink: v('primary-ink'), soft: v('primary-soft'), on: v('on-primary') },
        bark: v('bark'),
        clay: { DEFAULT: v('clay'), soft: v('clay-soft') },
        seal: v('seal'),
        brass: v('brass'),
        leaf: v('leaf'),
        warn: { DEFAULT: v('warn'), soft: v('warn-soft'), ink: v('warn-ink') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        photo: v('photo-bg'),
        chart: { 1: v('chart-1'), 2: v('chart-2'), 3: v('chart-3') }, // biểu đồ admin — đã kiểm tra mù màu (dataviz validator)
      },
      fontFamily: { body: sans, display: sans, sans },
      fontSize: {
        display: ['28px', { lineHeight: '1.2', letterSpacing: '-0.02em', fontWeight: '600' }],
        h1: ['22px', { lineHeight: '1.3', letterSpacing: '-0.015em', fontWeight: '600' }],
        h2: ['17px', { lineHeight: '1.4', letterSpacing: '-0.01em', fontWeight: '600' }],
        body: ['16px', { lineHeight: '1.55' }],
        caption: ['14px', { lineHeight: '1.45' }],
        label: ['12px', { lineHeight: '1.35', letterSpacing: '0.01em' }],
      },
      borderRadius: { card: '10px', btn: '8px', img: '8px', chip: '6px' },
      boxShadow: { card: '0 1px 2px rgba(16,16,15,0.04)', raised: '0 4px 16px rgba(16,16,15,0.08)' },
      spacing: { gutter: '16px', touch: '44px', cta: '48px' },
      maxWidth: { content: '560px', wide: '960px' },
      transitionTimingFunction: { calm: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      transitionDuration: { fast: '150ms', base: '220ms' },
    },
  },
};
