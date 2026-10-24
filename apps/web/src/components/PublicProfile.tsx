import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, Notice } from '@/components/ui';
import { accountApi } from '@/lib/account';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

const input = 'min-h-touch w-full rounded-btn border border-line-strong bg-surface px-3 text-body';
const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);

/** C3, D2 — Trang công khai /nguoi/{tên-trang} cho nhà vườn, nghệ nhân: giới thiệu, chuyên môn, tin đang bán. */
export function PublicProfile() {
  const { user, setUser } = useAuth();
  const me = user.status === 'ready' ? user.data : null;
  const [slug, setSlug] = useState(me?.public_slug ?? '');
  const [bio, setBio] = useState(me?.bio ?? '');
  const [tags, setTags] = useState((me?.specialties ?? []).join(', '));
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  useEffect(() => { // hồ sơ tải sau lần vẽ đầu
    if (!me) return;
    setSlug(me.public_slug ?? '');
    setBio(me.bio ?? '');
    setTags((me.specialties ?? []).join(', '));
  }, [me?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!me || !['nursery', 'artisan', 'admin'].includes(me.role)) return null;
  const save = async () => {
    setMsg(null);
    try {
      setUser(await accountApi.updateProfile({ public_slug: slugify(slug) || null, bio: bio.trim() || null,
        specialties: tags.split(',').map((t) => t.trim()).filter(Boolean) }));
      setSlug(slugify(slug));
      setMsg({ tone: 'success', text: 'Đã lưu trang.' });
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as ApiError).message });
    }
  };
  return (
    <section className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4 shadow-card" aria-label="Trang công khai">
      <div className="flex items-center justify-between">
        <h2 className="m-0 text-body font-semibold">Trang công khai</h2>
        {me.public_slug ? <Link to={`/nguoi/${me.public_slug}`} className="text-caption">Xem trang</Link> : null}
      </div>
      <label className="flex flex-col gap-1 text-caption font-medium">Tên trang
        <input value={slug} onChange={(e) => setSlug(e.target.value)} onBlur={() => setSlug(slugify(slug))} placeholder="vuon-ba-la" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-caption font-medium">Chuyên môn (cách nhau dấu phẩy)
        <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Si, Mai chiếu thủy, Tạo dáng thác đổ" className={input} />
      </label>
      <label className="flex flex-col gap-1 text-caption font-medium">Giới thiệu
        <textarea rows={3} maxLength={1000} value={bio} onChange={(e) => setBio(e.target.value)} className={`${input} py-2`} />
      </label>
      {msg ? <Notice tone={msg.tone}>{msg.text}</Notice> : null}
      <Button variant="secondary" size="touch" onClick={save}>Lưu trang</Button>
    </section>
  );
}
