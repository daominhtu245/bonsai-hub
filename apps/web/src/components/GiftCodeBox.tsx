import { useState, type FormEvent } from 'react';
import { Gift } from 'lucide-react';
import { Button, Notice } from '@/components/ui';
import { accountApi } from '@/lib/account';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Ô nhập mã quà tặng (Tài khoản, Mua lượt). */
export function GiftCodeBox() {
  const { refresh } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const r = await accountApi.redeemCode(code);
      setMsg({ tone: 'success', text: `Đã nhận ${r.credits_added} lượt. Bạn đang có ${r.credits} lượt.` });
      setCode('');
      refresh();
    } catch (err) {
      setMsg({ tone: 'danger', text: (err as ApiError).message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor="gift-code" className="flex items-center gap-2 text-caption font-medium">
        <Gift size={16} strokeWidth={1.75} className="text-ink-muted" aria-hidden="true" />
        Mã quà tặng
      </label>
      <div className="flex gap-2">
        <input id="gift-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="VD: TET2027" autoCapitalize="characters"
          className="min-h-touch min-w-0 flex-1 rounded-btn border border-line-strong bg-surface px-3 text-body uppercase tracking-wide text-ink" />
        <Button type="submit" size="touch" block={false} loading={busy} loadingLabel="Đang nhận…" disabled={code.trim().length < 4}>Nhận lượt</Button>
      </div>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
    </form>
  );
}
