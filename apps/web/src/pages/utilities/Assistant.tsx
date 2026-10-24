import { useEffect, useState } from 'react';
import { Send } from 'lucide-react';
import { BackHeader } from '@/components/BackHeader';
import { SpeakButton } from '@/components/SpeakButton';
import { VoiceInput } from '@/components/VoiceInput';
import { ButtonLink, Notice } from '@/components/ui';
import { accountApi, type GardenTree } from '@/lib/account';
import { ApiError } from '@/lib/api';
import { assistApi, pollUntilDone, type AssistantQuestion } from '@/lib/assist';
import { useAuth } from '@/lib/auth';

/** E4 — Hỏi đáp chăm cây bằng giọng nói hoặc chữ; trả lời đọc to được. Có ngay câu trả lời tra bảng, AI cập nhật sau. */
export default function AssistantPage() {
  const { user } = useAuth();
  const signedIn = user.status === 'ready';
  const [text, setText] = useState('');
  const [trees, setTrees] = useState<GardenTree[]>([]);
  const [treeId, setTreeId] = useState('');
  const [items, setItems] = useState<AssistantQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (signedIn) accountApi.garden().then((g) => setTrees(g.trees)).catch(() => null); }, [signedIn]);
  const latest = items[0];
  useEffect(() => (latest?.status === 'queued'
    ? pollUntilDone(() => assistApi.getQuestion(latest.id), (v) => setItems((xs) => xs.map((x) => (x.id === v.id ? v : x))))
    : undefined), [latest?.id, latest?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    const q = text.trim();
    if (q.length < 3) return;
    setBusy(true);
    setError(null);
    try {
      const r = await assistApi.ask(q, treeId || undefined);
      setItems((xs) => [r, ...xs]);
      setText('');
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/tien-ich" title="Hỏi cách chăm" />
      <div className="flex flex-col gap-3 px-gutter py-3">
        {!signedIn ? <Notice tone="info">Đăng nhập để hỏi.</Notice> : null}
        {trees.length ? (
          <label className="flex flex-col gap-1 text-caption font-medium">Cây
            <select value={treeId} onChange={(e) => setTreeId(e.target.value)} className="min-h-touch rounded-btn border border-line-strong bg-surface px-3 text-body font-normal">
              <option value="">Chung, không theo cây</option>
              {trees.map((t) => <option key={t.tree_id} value={t.tree_id}>{t.nickname || 'Cây chưa đặt tên'}</option>)}
            </select>
          </label>
        ) : null}
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2">
          <VoiceInput onText={setText} />
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Vd. Khi nào tuốt lá mai?" aria-label="Câu hỏi"
            className="min-h-cta min-w-0 flex-1 rounded-btn border border-line-strong bg-surface px-3 text-body" />
          <button type="submit" aria-label="Gửi" disabled={busy || text.trim().length < 3 || !signedIn}
            className="flex h-cta w-cta flex-none items-center justify-center rounded-btn border border-line-strong text-ink disabled:opacity-50"><Send size={20} aria-hidden="true" /></button>
        </form>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {items.map((q) => (
          <article key={q.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-card">
            <div className="text-caption text-ink-muted">{q.question}</div>
            {q.answer ? <p className="m-0 text-body">{q.answer.answer_vi}</p> : null}
            <div className="flex flex-wrap items-center gap-2">
              {q.answer ? <SpeakButton text={q.answer.answer_vi} /> : null}
              {q.status === 'queued' ? <span className="text-label text-ink-subtle" aria-live="polite">Đang hỏi thêm…</span> : null}
              {q.answer?.suggest_expert ? <ButtonLink to="/nghe-nhan" variant="secondary" size="touch" block={false}>Hỏi nghệ nhân</ButtonLink> : null}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
