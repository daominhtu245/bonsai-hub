const tokens = require('../../design/tailwind.tokens.cjs');

/** @type {import('tailwindcss').Config} */
module.exports = {
  presets: [tokens],
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    // Chỉ dùng màu từ token: không kế thừa bảng màu mặc định của Tailwind.
    colors: { transparent: 'transparent', current: 'currentColor' },
    extend: {
      minHeight: { touch: '44px', cta: '52px' },
      minWidth: { touch: '44px' },
    },
  },
  plugins: [],
};
