import { useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { cx } from '@/lib/cx';

type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

function getRecognition(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const voiceSupported = () => typeof window !== 'undefined' && getRecognition() !== null;

/** E4 — Nói thay gõ (nhận dạng giọng nói tiếng Việt của trình duyệt). Không hỗ trợ thì ẩn nút. */
export function VoiceInput({ onText, size = 'md' }: { onText: (t: string) => void; size?: 'md' | 'lg' }) {
  const Rec = typeof window !== 'undefined' ? getRecognition() : null;
  const [on, setOn] = useState(false);
  const rec = useRef<Recognition | null>(null);
  if (!Rec) return null;
  const toggle = () => {
    if (on) {
      rec.current?.stop();
      return;
    }
    const r = new Rec();
    r.lang = 'vi-VN';
    r.interimResults = true;
    r.continuous = false;
    r.onresult = (e) => onText(Array.from(e.results).map((x) => x[0].transcript).join(' '));
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  };
  return (
    <button type="button" onClick={toggle} aria-pressed={on} aria-label={on ? 'Dừng nghe' : 'Nói câu hỏi'}
      className={cx('flex flex-none items-center justify-center rounded-full shadow-raised', size === 'lg' ? 'h-24 w-24' : 'h-cta w-cta',
        on ? 'animate-pulse bg-seal text-primary-on' : 'bg-primary text-primary-on')}>
      {on ? <MicOff size={size === 'lg' ? 40 : 22} aria-hidden="true" /> : <Mic size={size === 'lg' ? 40 : 22} aria-hidden="true" />}
    </button>
  );
}
