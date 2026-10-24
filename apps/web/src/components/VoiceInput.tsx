import { useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { cx } from '@/lib/cx';

type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };

function getRecognition(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** E4 — Nói thay gõ (nhận dạng giọng nói tiếng Việt của trình duyệt). Không hỗ trợ thì ẩn nút. */
export function VoiceInput({ onText }: { onText: (t: string) => void }) {
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
      className={cx('flex h-cta w-cta flex-none items-center justify-center rounded-full', on ? 'bg-seal text-primary-on' : 'bg-primary text-primary-on')}>
      {on ? <MicOff size={22} aria-hidden="true" /> : <Mic size={22} aria-hidden="true" />}
    </button>
  );
}
