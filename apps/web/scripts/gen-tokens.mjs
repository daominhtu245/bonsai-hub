// Sinh src/styles/tokens.css từ design/tokens.json — nguồn duy nhất cho màu sáng/tối.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const tokensPath = process.env.TOKENS_PATH ?? resolve(here, '../../../design/tokens.json');
const tokens = JSON.parse(readFileSync(tokensPath, 'utf8'));

const vars = (scheme) =>
  Object.entries(tokens.color[scheme])
    .map(([k, v]) => `  --${k}: ${v};`)
    .join('\n');

const css = `/* Tự sinh từ design/tokens.json (${tokens.name} v${tokens.version}). Không sửa tay — chạy \`npm run tokens\`. */
:root {
  color-scheme: light;
${vars('light')}
  --motion-fast: ${tokens.motion.fast};
  --motion-base: ${tokens.motion.base};
  --easing: ${tokens.motion.easing};
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme='light']) {
    color-scheme: dark;
${vars('dark').replace(/^/gm, '  ')}
  }
}
:root[data-theme='dark'],
.theme-dark {
  color-scheme: dark;
${vars('dark')}
}
/* Nội dung đóng vai "ảnh chụp" (hình minh họa) giữ màu bảng sáng ở mọi chế độ. */
.theme-light {
${vars('light')}
  /* chữ không ghi màu riêng vẫn theo nền sáng (body đặt màu theo giao diện tối) */
  color: var(--ink);
}
`;
writeFileSync(resolve(here, '../src/styles/tokens.css'), css);
console.log('tokens.css generated');
