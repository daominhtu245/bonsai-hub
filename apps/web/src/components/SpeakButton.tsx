import { useEffect, useState } from 'react';
import { Square, Volume2 } from 'lucide-react';
import { cx } from '@/lib/cx';

/** E4 — Đọc to bằng giọng tiếng Việt của máy (Web Speech, không tốn API). Máy không hỗ trợ thì ẩn nút. */
export function SpeakButton({ text, label = 'Đọc to', className }: { text: string; label?: string; className?: string }) {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => () => { if (supported) window.speechSynthesis.cancel(); }, [supported]);
  if (!supported || !text.trim()) return null;
  const toggle = () => {
    const synth = window.speechSynthesis;
    if (speaking) {
      synth.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'vi-VN';
    u.rate = 0.95;
    const vi = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('vi'));
    if (vi) u.voice = vi;
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    synth.cancel();
    synth.speak(u);
    setSpeaking(true);
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={speaking}
      className={cx('inline-flex min-h-touch items-center gap-1.5 rounded-btn border border-line px-3 text-caption font-medium text-ink', className)}>
      {speaking ? <Square size={16} aria-hidden="true" /> : <Volume2 size={16} aria-hidden="true" />}
      {speaking ? 'Dừng đọc' : label}
    </button>
  );
}
