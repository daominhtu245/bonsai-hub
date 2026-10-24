import { useEffect, useRef, useState } from 'react';
import { Camera, X } from 'lucide-react';
import { BackHeader } from '@/components/BackHeader';
import { SpeakButton } from '@/components/SpeakButton';
import { Button, ButtonLink, Notice, Skeleton } from '@/components/ui';
import { ApiError, uploadPhoto } from '@/lib/api';
import { assistApi, pollUntilDone, type Finding, type HealthCheck } from '@/lib/assist';
import { cx } from '@/lib/cx';

function FindingCard({ f, first }: { f: Finding; first: boolean }) {
  const speech = [f.name_vi, f.reason_vi, 'Xử lý ngay:', ...f.treat_now_vi].filter(Boolean).join('. ');
  return (
    <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="m-0 text-body font-semibold">{f.name_vi}</h2>
          <span className={cx('text-label font-medium', f.likelihood === 'high' ? 'text-seal' : 'text-ink-muted')}>{f.likelihood_vi}</span>
        </div>
        {first ? <SpeakButton text={speech} /> : null}
      </div>
      {f.reason_vi ? <p className="m-0 text-caption">{f.reason_vi}</p> : f.signs_vi ? <p className="m-0 text-caption text-ink-muted">{f.signs_vi}</p> : null}
      <div className="text-caption">
        <div className="font-semibold">Xử lý ngay</div>
        <ol className="m-0 pl-5">{f.treat_now_vi.map((t) => <li key={t}>{t}</li>)}</ol>
      </div>
      {f.prevent_vi.length ? <div className="text-caption"><div className="font-semibold">Phòng lần sau</div><ul className="m-0 pl-5">{f.prevent_vi.map((t) => <li key={t}>{t}</li>)}</ul></div> : null}
      {f.see_expert_if_vi ? <p className="m-0 text-label text-ink-muted">Hỏi nghệ nhân nếu: {f.see_expert_if_vi}</p> : null}
    </section>
  );
}

/** E3 — Chụp lá đoán sâu bệnh: chụp gần lá / cành + chọn dấu hiệu → kết quả tra bảng ngay, AI xem ảnh rồi cập nhật. */
export default function HealthPage() {
  const [symptoms, setSymptoms] = useState<{ code: string; label_vi: string }[]>([]);
  const [chosen, setChosen] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [check, setCheck] = useState<HealthCheck | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { assistApi.symptoms().then(setSymptoms).catch(() => null); }, []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  useEffect(() => (check?.status === 'queued' ? pollUntilDone(() => assistApi.getCheck(check.id), setCheck) : undefined), [check?.id, check?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      setCheck(await assistApi.check({ symptoms: chosen, photo_key: file ? await uploadPhoto(file) : undefined }));
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };
  const r = check?.result;
  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to="/tien-ich" title="Lá có bệnh?" />
      <div className="flex flex-col gap-4 px-gutter py-3">
        {check ? (
          <>
            {check.status === 'queued' ? <Notice tone="info">Đang xem kỹ ảnh lá…</Notice> : null}
            {r?.photo_unusable && r.issue_vi ? <Notice tone="warn">{r.issue_vi}</Notice> : null}
            {r?.healthy ? <Notice tone="success">Lá trông khỏe, chưa thấy dấu hiệu sâu bệnh rõ.</Notice> : null}
            {r && r.findings.length ? r.findings.map((f, i) => <FindingCard key={f.key} f={f} first={i === 0} />)
              : check.status === 'queued' ? <Skeleton className="h-40 rounded-card" />
              : r?.healthy ? null : <Notice tone="warn">Chưa nhận ra bệnh. Chụp gần hơn, đủ sáng, hoặc hỏi nghệ nhân.</Notice>}
            <p className="m-0 text-label text-ink-subtle">Kết quả tham khảo. Dùng thuốc theo hướng dẫn trên bao bì.</p>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="touch" onClick={() => { setCheck(null); setChosen([]); setFile(null); setPreview(null); }}>Kiểm tra lại</Button>
              <ButtonLink to="/nghe-nhan" variant="secondary" size="touch">Hỏi nghệ nhân</ButtonLink>
            </div>
          </>
        ) : (
          <>
            <button type="button" onClick={() => input.current?.click()}
              className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-card border border-dashed border-line-strong bg-surface text-caption font-medium">
              {preview ? <img src={preview} alt="Ảnh lá đã chọn" className="absolute inset-0 h-full w-full object-cover" /> : (
                <span className="flex flex-col items-center gap-2"><Camera size={28} aria-hidden="true" />Chụp gần lá, cành bị bệnh</span>
              )}
            </button>
            {preview ? (
              <button type="button" onClick={() => { setFile(null); setPreview(null); }} className="-mt-2 inline-flex min-h-touch items-center gap-1 self-start text-caption text-ink-muted">
                <X size={14} aria-hidden="true" />Bỏ ảnh
              </button>
            ) : null}
            <input ref={input} type="file" accept="image/*" capture="environment" hidden
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) { setFile(f); setPreview(URL.createObjectURL(f)); } }} />
            <fieldset className="m-0 border-0 p-0">
              <legend className="mb-2 text-caption font-semibold">Thấy dấu hiệu nào?</legend>
              <div className="flex flex-wrap gap-1.5">
                {symptoms.map((s) => (
                  <button key={s.code} type="button" aria-pressed={chosen.includes(s.code)}
                    onClick={() => setChosen((c) => (c.includes(s.code) ? c.filter((x) => x !== s.code) : [...c, s.code]))}
                    className={cx('min-h-touch rounded-chip border px-3 text-left text-label', chosen.includes(s.code) ? 'border-ink bg-surface-2 font-semibold text-ink' : 'border-line text-ink-muted')}>
                    {s.label_vi}
                  </button>
                ))}
              </div>
            </fieldset>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <Button onClick={submit} loading={busy} loadingLabel="Đang gửi…" disabled={busy || (!file && !chosen.length)}>Xem bệnh gì</Button>
          </>
        )}
      </div>
    </div>
  );
}
