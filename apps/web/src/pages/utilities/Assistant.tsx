import { useEffect, useRef, useState } from 'react';
import { GraduationCap, MessageCircleQuestion, Send, Sprout } from 'lucide-react';
import { Link } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { SpeakButton } from '@/components/SpeakButton';
import { VoiceInput, voiceSupported } from '@/components/VoiceInput';
import { IconBadge, Notice } from '@/components/ui';
import { accountApi, type GardenTree } from '@/lib/account';
import { ApiError } from '@/lib/api';
import { assistApi, pollUntilDone, type AssistantQuestion } from '@/lib/assist';
import { useAuth } from '@/lib/auth';
import { cx } from '@/lib/cx';
import { useFeature } from '@/lib/features';

const SUGGEST = ['Khi nào nên tuốt lá?', 'Tưới thế nào cho đúng?', 'Bao lâu thay chậu một lần?', 'Cắt tỉa cành ra sao?', 'Uốn dây lúc nào?', 'Bón phân gì, khi nào?'];

/** E4 — Hỏi cách chăm: nói hoặc gõ, câu trả lời như trò chuyện, nghe đọc to; gợi ý câu hỏi theo cây. */
export default function AssistantPage() {
  const { user } = useAuth();
  const signedIn = user.status === 'ready';
  const consults = useFeature('consults');
  const [text, setText] = useState('');
  const [trees, setTrees] = useState<GardenTree[]>([]);
  const [treeId, setTreeId] = useState('');
  const [items, setItems] = useState<AssistantQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (signedIn) accountApi.garden().then((g) => setTrees(g.trees)).catch(() => null); }, [signedIn]);
  const latest = items[items.length - 1];
  useEffect(() => (latest?.status === 'queued'
    ? pollUntilDone(() => assistApi.getQuestion(latest.id), (v) => setItems((xs) => xs.map((x) => (x.id === v.id ? v : x))))
    : undefined), [latest?.id, latest?.status]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView?.({ behavior: 'smooth', block: 'end' }); }, [items.length, latest?.status]);

  const tree = trees.find((t) => t.tree_id === treeId);
  const send = async (q0?: string) => {
    const q = (q0 ?? text).trim();
    if (q.length < 3 || !signedIn) return;
    setBusy(true);
    setError(null);
    try {
      const r = await assistApi.ask(q, treeId || undefined);
      setItems((xs) => [...xs, r]);
      setText('');
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex h-dvh max-w-content flex-col">
      <BackHeader to="/tien-ich" title="Hỏi cách chăm" />
      {trees.length ? (
        <div role="radiogroup" aria-label="Hỏi cho cây" className="flex flex-none gap-2 overflow-x-auto border-b border-line px-gutter py-2">
          {[{ tree_id: '', nickname: 'Chung', thumbnail_url: null } as Pick<GardenTree, 'tree_id' | 'nickname' | 'thumbnail_url'>, ...trees].map((t) => (
            <button key={t.tree_id || 'all'} type="button" role="radio" aria-checked={treeId === t.tree_id} onClick={() => setTreeId(t.tree_id)}
              className={cx('flex min-h-touch flex-none items-center gap-2 rounded-full border py-1 pl-1 pr-3 text-caption font-medium',
                treeId === t.tree_id ? 'border-ink bg-surface-2 text-ink' : 'border-line text-ink-muted')}>
              {t.thumbnail_url ? <img src={t.thumbnail_url} alt="" className="h-8 w-8 rounded-full object-cover" />
                : <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-soft text-primary-ink"><Sprout size={16} aria-hidden="true" /></span>}
              {t.nickname || 'Cây chưa đặt tên'}
            </button>
          ))}
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-gutter py-4">
        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <div className="flex flex-col items-center gap-3">
              {voiceSupported() ? <VoiceInput onText={setText} size="lg" /> : <IconBadge Icon={MessageCircleQuestion} tone="leaf" size="lg" />}
              <span className="text-caption text-ink-muted">
                {!signedIn ? 'Đăng nhập để hỏi' : `${voiceSupported() ? 'Chạm để nói' : 'Chọn câu hỏi hoặc gõ'}${tree ? ` · ${tree.nickname || 'cây này'}` : ''}`}
              </span>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGEST.map((s) => (
                <button key={s} type="button" disabled={!signedIn || busy} onClick={() => send(s)}
                  className="min-h-touch rounded-full border border-line bg-surface px-4 text-caption text-ink shadow-card hover:bg-surface-2 disabled:opacity-50">{s}</button>
              ))}
            </div>
          </div>
        ) : items.map((q) => (
          <div key={q.id} className="flex flex-col gap-2">
            <p className="m-0 max-w-[85%] self-end rounded-card rounded-br-sm bg-primary px-3 py-2 text-body text-primary-on">{q.question}</p>
            <div className="flex max-w-[92%] flex-col gap-2 self-start rounded-card rounded-bl-sm border border-line bg-surface px-3 py-2.5 shadow-card">
              {q.answer ? <p className="m-0 text-body">{q.answer.answer_vi}</p> : null}
              <div className="flex flex-wrap items-center gap-2">
                {q.answer ? <SpeakButton text={q.answer.answer_vi} /> : null}
                {q.status === 'queued' ? <span className="text-label text-ink-subtle" aria-live="polite">Đang hỏi thêm…</span> : null}
                {q.answer?.suggest_expert && consults ? (
                  <Link to="/nghe-nhan" className="inline-flex min-h-touch items-center gap-1 text-caption font-medium"><GraduationCap size={16} aria-hidden="true" />Hỏi nghệ nhân</Link>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        <div ref={end} />
      </div>

      <div className="flex-none border-t border-line bg-bg px-gutter pb-4 pt-2">
        {error ? <div className="mb-2"><Notice tone="danger">{error}</Notice></div> : null}
        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex items-center gap-2">
          {items.length ? <VoiceInput onText={setText} /> : null}
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={500} placeholder="Gõ câu hỏi…" aria-label="Câu hỏi"
            className="min-h-cta min-w-0 flex-1 rounded-full border border-line-strong bg-surface px-4 text-body" />
          <button type="submit" aria-label="Gửi" disabled={busy || text.trim().length < 3 || !signedIn}
            className="flex h-cta w-cta flex-none items-center justify-center rounded-full bg-primary text-primary-on disabled:opacity-40"><Send size={20} aria-hidden="true" /></button>
        </form>
      </div>
    </div>
  );
}
