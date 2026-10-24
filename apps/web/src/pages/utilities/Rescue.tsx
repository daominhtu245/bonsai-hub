import { useEffect, useState } from 'react';
import { BackHeader } from '@/components/BackHeader';
import { Button, ButtonLink, Notice, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { toolsApi, type RescuePlan } from '@/lib/tools';

/** Cấp cứu cây: trả lời có / không → việc cần làm 24 giờ, sau 3 và 7 ngày. */
export default function RescuePage() {
  const [qs, setQs] = useState<{ key: string; text_vi: string }[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});
  const [plan, setPlan] = useState<RescuePlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { toolsApi.rescueQuestions().then(setQs).catch((e: ApiError) => setError(e.message)); }, []);
  const submit = () => toolsApi.rescue(answers).then(setPlan).catch((e: ApiError) => setError(e.message));
  return (
    <div className="mx-auto max-w-content pb-10">
      <BackHeader to="/tien-ich" title="Cấp cứu cây" />
      <div className="flex flex-col gap-4 px-gutter py-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        {!qs ? <Skeleton className="h-72 rounded-card" /> : plan ? (
          <>
            <div className="rounded-card border border-line bg-surface p-4 shadow-card">
              <div className="text-caption text-ink-muted">Khả năng</div>
              <div className="text-[20px] font-semibold">{plan.cause_vi}</div>
            </div>
            {[['Làm ngay hôm nay', plan.now], ['Sau 3 ngày', plan.day3], ['Sau 7 ngày', plan.day7]].map(([t, list]) => (list as string[]).length ? (
              <section key={t as string} className="rounded-card border border-line bg-surface p-4 shadow-card">
                <h2 className="m-0 mb-2 text-body font-semibold">{t as string}</h2>
                <ul className="m-0 flex flex-col gap-1.5 pl-5 text-body">{(list as string[]).map((x) => <li key={x}>{x}</li>)}</ul>
              </section>
            ) : null)}
            {plan.see_expert ? <ButtonLink to="/nghe-nhan" variant="secondary">Hỏi nghệ nhân</ButtonLink> : null}
            <Button variant="ghost" onClick={() => { setPlan(null); setAnswers({}); }}>Trả lời lại</Button>
          </>
        ) : (
          <>
            <div className="sticky top-14 z-[5] -mx-gutter flex items-center gap-3 bg-bg px-gutter py-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-label="Đã trả lời" aria-valuemin={0} aria-valuemax={qs.length} aria-valuenow={Object.keys(answers).length}>
                <div className="h-full rounded-full bg-primary transition-[width] duration-base" style={{ width: `${qs.length ? (Object.keys(answers).length / qs.length) * 100 : 0}%` }} />
              </div>
              <span className="tabular text-label font-semibold text-ink-muted">{Object.keys(answers).length}/{qs.length}</span>
            </div>
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {qs.map((q, i) => (
                <li key={q.key} className={cx('flex flex-col gap-2 rounded-card border bg-surface p-3', answers[q.key] === true ? 'border-warn' : 'border-line')}>
                  <span className="flex gap-2 text-body"><span className="tabular font-semibold text-ink-subtle">{i + 1}.</span>{q.text_vi}</span>
                  <div className="grid grid-cols-2 gap-2" role="group" aria-label={q.text_vi}>
                    {([[true, 'Có'], [false, 'Không']] as const).map(([v, label]) => (
                      <button key={label} type="button" aria-pressed={answers[q.key] === v} onClick={() => setAnswers((a) => ({ ...a, [q.key]: v }))}
                        className={cx('min-h-touch rounded-btn border text-body', answers[q.key] === v ? (v ? 'border-warn bg-warn-soft font-semibold text-warn-ink' : 'border-primary bg-primary-soft font-semibold text-primary-ink') : 'border-line bg-surface text-ink-muted')}>
                        {label}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
            <Button onClick={submit}>Xem cách xử lý</Button>
          </>
        )}
      </div>
    </div>
  );
}
