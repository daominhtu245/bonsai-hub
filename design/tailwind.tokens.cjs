// Tailwind preset cho hệ thống "Rêu & Gốm".
// Màu dùng CSS variables để chế độ tối đổi theo hệ thống (xem block CSS bên dưới, đưa vào src/index.css).
//
// :root {
//   --bg:#F4EFE6; --surface:#FBF8F2; --line:#E3DCCD; --line-strong:#D9CFBC;
//   --ink:#1F2421; --ink-muted:#5E625C; --primary:#3F5B3A; --primary-ink:#2C4229;
//   --primary-soft:#DCE5D3; --on-primary:#FBF8F2; --bark:#6B4F3A; --clay:#8C5A3C;
//   --clay-soft:#F1E4DA; --seal:#B23A2B; --brass:#B08D57; --leaf:#5E8C4F;
//   --warn:#C08A2E; --warn-soft:#F7EEDB; --warn-ink:#6E4D12; --danger:#962F23;
//   --danger-soft:#F6E1DD; --photo-bg:#E8E1D3;
// }
// @media (prefers-color-scheme: dark) { :root {
//   --bg:#141815; --surface:#1E2420; --line:#2F3631; --line-strong:#3A423C;
//   --ink:#ECE7DD; --ink-muted:#A7A99F; --primary:#8DB07F; --primary-ink:#B9D3AD;
//   --primary-soft:#2A3A28; --on-primary:#141815; --bark:#C4A68A; --clay:#D19A76;
//   --clay-soft:#3A2A20; --seal:#E0705F; --brass:#D4B47E; --leaf:#9CC48B;
//   --warn:#E2B25C; --warn-soft:#3A3020; --warn-ink:#F0D49A; --danger:#E58A7C;
//   --danger-soft:#3A2220; --photo-bg:#262B27;
// } }

const v = (name) => `var(--${name})`;

module.exports = {
  theme: {
    extend: {
      colors: {
        bg: v('bg'),
        surface: v('surface'),
        line: { DEFAULT: v('line'), strong: v('line-strong') },
        ink: { DEFAULT: v('ink'), muted: v('ink-muted') },
        primary: { DEFAULT: v('primary'), ink: v('primary-ink'), soft: v('primary-soft'), on: v('on-primary') },
        bark: v('bark'),
        clay: { DEFAULT: v('clay'), soft: v('clay-soft') },
        seal: v('seal'),
        brass: v('brass'),
        leaf: v('leaf'),
        warn: { DEFAULT: v('warn'), soft: v('warn-soft'), ink: v('warn-ink') },
        danger: { DEFAULT: v('danger'), soft: v('danger-soft') },
        photo: v('photo-bg'),
      },
      fontFamily: {
        display: ['Lora', 'Georgia', 'serif'],
        body: ['"Be Vietnam Pro"', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        display: ['31px', { lineHeight: '1.25' }],
        h1: ['24px', { lineHeight: '1.3' }],
        h2: ['20px', { lineHeight: '1.35' }],
        body: ['17px', { lineHeight: '1.5' }],
        caption: ['14px', { lineHeight: '1.45' }],
        label: ['13px', { lineHeight: '1.4' }],
      },
      borderRadius: { card: '12px', btn: '10px', img: '8px' },
      spacing: { gutter: '16px', touch: '44px', cta: '52px' },
      maxWidth: { content: '560px' },
      transitionTimingFunction: { calm: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      transitionDuration: { fast: '200ms', base: '300ms' },
    },
  },
};
