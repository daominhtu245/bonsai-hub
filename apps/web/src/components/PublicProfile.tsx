import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Globe } from 'lucide-react';
import { Button, Chip, IconBadge, Notice } from '@/components/ui';
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
  const [open, setOpen] = useState(false);
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
      setOpen(false);
    } catch (e) {
      setMsg({ tone: 'danger', text: (e as ApiError).message });
    }
  };
  return (
    <section className="overflow-hidden rounded-card border border-line bg-surface shadow-card" aria-label="Trang công khai">
      <div className="flex items-center gap-3 p-4">
        <IconBadge Icon={Globe} tone="leaf" />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-body font-semibold">Trang công khai</span>
          <span className="truncate text-label text-ink-muted">{me.public_slug ? `/nguoi/${me.public_slug}` : 'Chưa tạo'}</span>
        </span>
        {me.public_slug ? <Link to={`/nguoi/${me.public_slug}`} className="flex min-h-touch items-center px-1 text-caption font-medium">Xem</Link> : null}
        <Button size="touch" block={false} variant="secondary" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? 'Đóng' : me.public_slug ? 'Sửa' : 'Tạo trang'}
        </Button>
      </div>
      {!open && me.specialties?.length ? (
        <div className="-mt-1 flex flex-wrap gap-1.5 px-4 pb-4">{me.specialties.map((t) => <Chip key={t} tone="outline">{t}</Chip>)}</div>
      ) : null}
      {msg && !open ? <div className="px-4 pb-4"><Notice tone={msg.tone}>{msg.text}</Notice></div> : null}
      {open ? (
        <div className="flex flex-col gap-2 border-t border-line p-4">
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
          <Button size="touch" onClick={save}>Lưu trang</Button>
        </div>
      ) : null}
    </section>
  );
}
