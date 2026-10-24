import { useEffect, useState } from 'react';
import { Gift, Share2 } from 'lucide-react';
import { Button } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { toolsApi, type Referral } from '@/lib/tools';

/** Giới thiệu bạn: chia sẻ link; bạn phân tích phôi đầu tiên thì cả hai được tặng lượt. */
export function ReferralCard() {
  const [r, setR] = useState<Referral | null>(null);
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => { toolsApi.referral().then(setR).catch(() => null); }, []);
  if (!r) return null;
  const share = async () => {
    const text = `Mình dùng Bonsai AI để xem phôi thành cây gì. Dùng mã ${r.code} để cả hai được tặng ${r.credits_each} lượt:`;
    if (navigator.share) await navigator.share({ title: 'Bonsai AI', text, url: r.link }).catch(() => null);
    else { await navigator.clipboard?.writeText(`${text} ${r.link}`).catch(() => null); setMsg('Đã chép link.'); }
  };
  const claim = () => toolsApi.claimReferral(code).then(() => { setMsg('Đã nhận mã. Bạn được tặng lượt khi phân tích phôi đầu tiên.'); setR({ ...r, claimed: true }); })
    .catch((e: ApiError) => setMsg(e.message));
  return (
    <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-card">
      <div className="flex items-center gap-2 text-body font-semibold"><Gift size={18} aria-hidden="true" />Giới thiệu bạn — mỗi bên +{r.credits_each} lượt</div>
      <div className="flex items-center gap-2">
        <span className="rounded-btn bg-surface-2 px-3 py-2 font-mono text-[18px] font-semibold tracking-[0.15em]">{r.code}</span>
        <Button size="touch" block={false} onClick={share}><Share2 size={16} aria-hidden="true" />Gửi cho bạn</Button>
      </div>
      {r.invited ? <span className="text-caption text-ink-muted">Đã mời {r.invited} người · {r.rewarded} người đã dùng</span> : null}
      {!r.claimed ? (
        <div className="flex gap-2">
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={12} placeholder="Mã người giới thiệu bạn" aria-label="Mã người giới thiệu bạn"
            className="min-h-touch min-w-0 flex-1 rounded-btn border border-line-strong bg-surface px-3 text-body uppercase" />
          <Button size="touch" block={false} variant="secondary" disabled={code.length < 4} onClick={claim}>Nhập</Button>
        </div>
      ) : null}
      {msg ? <span className="text-caption text-ink-muted" role="status">{msg}</span> : null}
    </div>
  );
}
