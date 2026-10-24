import { useCallback, useEffect, useState } from 'react';
import { Check, Trophy } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { ButtonLink, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { communityApi, type ChallengeDetail } from '@/lib/community';
import { cx } from '@/lib/cx';
import { dmy } from './Challenges';

/** B4 — Một thử thách: phôi chung, bài dự thi (đang mở: trộn, ẩn số phiếu; đã đóng: xếp hạng). */
export default function ChallengeDetailPage() {
  const { challengeId = '' } = useParams();
  const [c, setC] = useState<ChallengeDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => communityApi.challenge(challengeId).then(setC).catch((e: ApiError) => setError(e.message)), [challengeId]);
  useEffect(() => { load(); }, [load]);
  const vote = (id: number) => {
    setError(null);
    communityApi.voteEntry(challengeId, id).then(load).catch((e: ApiError) => setError(e.message));
  };
  const open = c?.state === 'open';
  const mine = c?.entries.find((e) => e.mine);

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/thu-thach" title={c?.title ?? 'Thử thách phôi'} />
      <div className="flex flex-col gap-4 px-gutter py-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {!c ? (error ? null : <Skeleton className="aspect-[3/4] rounded-card" />) : (
          <>
            <section className="flex gap-3 rounded-card border border-line bg-surface p-3 shadow-card">
              {c.photo_url ? <img src={c.photo_url} alt="Phôi của thử thách" className="h-28 w-24 flex-none rounded-img object-cover" /> : null}
              <div className="flex min-w-0 flex-col gap-1 text-caption">
                <span className="text-ink-muted">{dmy(c.starts_at)} – {dmy(c.ends_at)}</span>
                {c.description ? <p className="m-0">{c.description}</p> : null}
                {c.prize ? <span className="inline-flex items-center gap-1 font-medium"><Trophy size={14} aria-hidden="true" />{c.prize}</span> : null}
              </div>
            </section>
            {open ? <ButtonLink to={`/thu-thach/${c.id}/thiet-ke`}>{mine ? 'Sửa bài của tôi' : 'Tham gia thiết kế'}</ButtonLink> : null}
            {c.entries.length === 0 ? <Notice tone="info">Chưa có bài dự thi.</Notice> : (
              <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0">
                {c.entries.map((e, i) => (
                  <li key={e.id} className={cx('flex flex-col overflow-hidden rounded-card border bg-surface shadow-card', c.my_vote === e.id ? 'border-ink' : 'border-line')}>
                    <span className="relative block aspect-[3/4] bg-photo">
                      <img src={e.image_url} alt={`Bài của ${e.author}`} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
                      {!open && i < 3 && (e.votes ?? 0) > 0 ? <span className="theme-light absolute left-2 top-2 rounded-chip bg-surface px-2 py-0.5 text-label font-semibold shadow-raised">Hạng {i + 1}</span> : null}
                      <span className="theme-light absolute right-2 top-2 rounded-chip bg-surface px-2 py-0.5 text-label text-ink-muted shadow-raised">Minh họa</span>
                    </span>
                    <span className="flex min-h-touch items-center justify-between gap-1 px-2 text-label">
                      <span className="truncate">{e.mine ? 'Bài của tôi' : e.author}</span>
                      {open ? (e.mine ? null : (
                        <button type="button" onClick={() => vote(e.id)} aria-pressed={c.my_vote === e.id}
                          className={cx('inline-flex min-h-touch items-center gap-1 rounded-btn px-2 font-medium', c.my_vote === e.id ? 'text-primary' : 'text-ink-muted')}>
                          {c.my_vote === e.id ? <><Check size={14} aria-hidden="true" />Đã bầu</> : 'Bầu'}
                        </button>
                      )) : <span className="tabular font-semibold">{e.votes} phiếu</span>}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
