// Giao diện sáng / tối. Mặc định SÁNG (người dùng lớn tuổi quen nền sáng); "Theo máy" theo cài đặt hệ điều hành.
// index.html áp dụng trước khi React chạy để không nháy nền tối.
export type ThemePref = 'light' | 'dark' | 'system';
const KEY = 'bonsai.theme';

export function getTheme(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'dark' || v === 'system' ? v : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(pref: ThemePref): void {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

export function setTheme(pref: ThemePref): void {
  try {
    localStorage.setItem(KEY, pref);
  } catch {
    /* chế độ riêng tư: chỉ áp dụng trong phiên */
  }
  applyTheme(pref);
}
