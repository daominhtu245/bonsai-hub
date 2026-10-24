import { useEffect, useState } from 'react';
import { Notice } from '@/components/ui';
import { accountApi, type Announcement } from '@/lib/account';

/** Thông báo chung do quản trị bật (vd. khuyến mãi, bảo trì). Không có thì không hiện gì. */
export function AnnouncementBar({ className }: { className?: string }) {
  const [a, setA] = useState<Announcement | null>(null);
  useEffect(() => {
    accountApi.announcement().then(setA).catch(() => setA(null));
  }, []);
  if (!a) return null;
  return <div className={className} role="status"><Notice tone={a.tone}>{a.text}</Notice></div>;
}
