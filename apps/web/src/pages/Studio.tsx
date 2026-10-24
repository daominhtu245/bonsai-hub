import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import {
  Amphora, Check, ChevronLeft, Copy, Eye, EyeOff, FlipHorizontal2, Leaf as LeafIcon, Minimize2, Mountain, Plus, Scissors,
  Share2, Sparkles, Sprout, Trash2, Undo2, X,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Notice, Segmented, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { communityApi } from '@/lib/community';
import { studioApi, type Preview, type Sprite, type StudioData } from '@/lib/studio';
import {
  LEAF_OF, LEAF_VI, LIMIT, branchEnd, defaultPot, fromDraft, fromTemplate, liveHints, padName, toInput, uid,
  type Design, type Item, type Leaf, type NewB,
} from './studio/model';

// Màn Tự thiết kế dạng trình chỉnh ảnh: ảnh cố định phía trên (không cuộn trang), công cụ cố định phía dưới.
// Mỗi chế độ chỉ cho chạm vào đúng loại chi tiết của nó để không bấm nhầm (vd. chế độ Cành thì tầng lá mờ đi).

type Tab = 'branch' | 'pad' | 'pot' | 'accent' | 'done';
type ItemSel = { kind: 'pad' | 'accent'; id: string } | { kind: 'pot' };
type Sel = ItemSel | { kind: 'new'; id: string } | { kind: 'apex' } | null;
type Hit = { kind: 'pad' | 'accent' | 'new' | 'branch'; id: string } | { kind: 'pot' | 'apex' | 'handle' } | null;
interface View { k: number; tx: number; ty: number }
type Gesture =
  | { t: 'drag'; target: NonNullable<Sel>; dx: number; dy: number; sx: number; sy: number; moved: boolean }
  | { t: 'handle'; sx: number; sy: number; moved: boolean }
  | { t: 'tap'; hit: Hit; sx: number; sy: number; moved: boolean; pan: View | null }
  | { t: 'pinch'; d0: number; a0: number; mid0: [number, number]; item: Item | null; view: View; moved: boolean };

const TAP_PX = 8; // dịch dưới ngưỡng này (px màn hình) là chạm, không phải kéo
const TOUCH_PX = 44; // vùng chạm tối thiểu
const MAX_ZOOM = 4;
const TABS: Array<[Tab, string, typeof Scissors]> = [
  ['branch', 'Cành', Scissors], ['pad', 'Tầng lá', LeafIcon], ['pot', 'Chậu', Amphora], ['accent', 'Rêu, đá', Mountain], ['done', 'Hoàn tất', Check],
];
const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);
const isItemSel = (x: Sel): x is ItemSel => x?.kind === 'pad' || x?.kind === 'accent' || x?.kind === 'pot';

function Slider({ label, value, min, max, onChange, onStart }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; onStart: () => void }) {
  return (
    <label className="flex min-h-touch items-center gap-3 text-caption">
      <span className="w-[4.5rem] flex-none whitespace-nowrap text-ink-muted">{label}</span>
      <input type="range" min={min} max={max} value={value} onPointerDown={onStart} onKeyDown={onStart} onChange={(e) => onChange(Number(e.target.value))}
        className="h-touch flex-1 accent-[var(--primary)]" />
    </label>
  );
}

function Thumb({ sprite, onPick, active }: { sprite: Sprite; onPick: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onPick} aria-pressed={active} aria-label={`Thêm ${sprite.label_vi}`}
      className={cx('flex h-[92px] w-[92px] flex-none flex-col items-center justify-center gap-1 rounded-btn border bg-surface-2 p-1.5 text-label',
        active ? 'border-ink ring-1 ring-ink' : 'border-line')}>
      <img src={`/studio/${sprite.file}`} alt="" className="h-12 w-full object-contain" loading="lazy" draggable={false} />
      <span className="line-clamp-1 text-ink-muted">{sprite.label_vi.split(' · ')[0]}</span>
    </button>
  );
}

function ToolButton({ icon, label, onClick, danger }: { icon: ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button type="button" onClick={onClick}
      className={cx('flex min-h-[48px] flex-col items-center justify-center gap-0.5 rounded-btn border border-line text-label', danger ? 'text-danger' : 'text-ink')}>
      {icon}{label}
    </button>
  );
}

const Row = ({ children }: { children: ReactNode }) => <div className="-mx-gutter flex gap-2 overflow-x-auto px-gutter pb-1">{children}</div>;

/** `challengeId`: thiết kế bài dự thi trên phôi của thử thách (không lưu thành phương án, không xem thử AI). */
export default function Studio({ challengeId }: { challengeId?: string } = {}) {
  const { jobId = '' } = useParams();
  const back = challengeId ? `/thu-thach/${challengeId}` : `/chon/${jobId}`;
  const navigate = useNavigate();
  const [data, setData] = useState<StudioData | null>(null);
  const [lib, setLib] = useState<Map<string, Sprite>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState<Design | null>(null);
  const [history, setHistory] = useState<Design[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [tab, setTab] = useState<Tab>('branch');
  const [real, setReal] = useState(false); // "Xem như thật": ẩn nét đánh dấu
  const [peek, setPeek] = useState(false); // giữ để xem ảnh gốc
  const [leaf, setLeaf] = useState<Leaf>('needle');
  const [view, setView] = useState<View>({ k: 1, tx: 0, ty: 0 });
  const [box, setBox] = useState({ w: 0, h: 0 });
  const [busy, setBusy] = useState<null | 'save' | 'preview' | 'share'>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [shared, setShared] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const pts = useRef(new Map<number, [number, number]>());
  const g = useRef<Gesture | null>(null);

  useEffect(() => {
    const source = challengeId ? communityApi.challengeStudio(challengeId) : studioApi.get(jobId);
    Promise.all([source, studioApi.library().catch(() => [] as Sprite[])]).then(([d, items]) => {
      const m = new Map(items.map((x) => [x.key, x]));
      const lf = LEAF_OF[d.species_key ?? ''] ?? 'needle';
      setLib(m);
      setLeaf(lf);
      setData(d);
      setS(d.draft ? fromDraft(d, d.draft, lf, m) : !challengeId && d.templates[0] ? fromTemplate(d, d.templates[0], lf, m)
        : { style_key: d.styles[0]?.key ?? 'moyogi', removed: [], pads: [], accents: [], news: [], apex: d.candidate_apex_px, pot: defaultPot(d, m) });
    }).catch((e: ApiError) => setError(e.message));
    if (!challengeId) studioApi.preview(jobId).then(setPreview).catch(() => null);
  }, [jobId, challengeId]);

  useEffect(() => { // chờ ảnh xem thử
    if (preview?.state !== 'running') return;
    const t = window.setTimeout(() => studioApi.preview(jobId).then(setPreview).catch(() => null), 4000);
    return () => window.clearTimeout(t);
  }, [preview, jobId]);

  useEffect(() => { // kích thước khung ảnh → quy đổi vùng chạm 44 px sang đơn vị ảnh
    const el = boxRef.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight });
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  const hints = useMemo(() => (data && s ? liveHints(data, s, lib) : []), [data, s, lib]);
  if (!data || !s) {
    return (
      <div className="mx-auto flex h-dvh max-w-content flex-col">
        <header className="flex h-14 items-center gap-1 border-b border-line px-2">
          <Link to={back} aria-label="Quay lại" className="flex h-touch w-touch items-center justify-center text-ink"><ChevronLeft size={22} /></Link>
          <h1 className="text-[15px] font-semibold">{challengeId ? 'Bài dự thi' : 'Tự thiết kế'}</h1>
        </header>
        <div className="p-gutter">{error ? <Notice tone="danger">{error}</Notice> : <Skeleton className="aspect-[3/4] w-full rounded-card" />}</div>
      </div>
    );
  }

  const W = data.width, H = data.height;
  const trunkH = data.trunk.height_px;
  const [bx, by] = data.trunk.base_point_px;
  const fit = box.w && box.h ? Math.min(box.w / W, box.h / H) : 0;
  const ppu = fit ? fit * view.k : 1; // px màn hình trên 1 px ảnh
  const u = (px: number) => px / ppu;
  const aspect = (k: string) => lib.get(k)?.aspect ?? 0.3;
  const edit = !real && !peek;
  const branchMode = tab === 'branch';

  const snap = () => setHistory((h) => [...h.slice(-30), s]);
  const unsnap = () => setHistory((h) => h.slice(0, -1));
  const commit = (next: Design) => { snap(); setS(next); };
  const undo = () => { const prev = history[history.length - 1]; if (prev) { setS(prev); setHistory(history.slice(0, -1)); setSel(null); } };

  const itemOf = (t: Sel, d: Design = s): Item | undefined =>
    t?.kind === 'pad' ? d.pads.find((p) => p.id === t.id) : t?.kind === 'accent' ? d.accents.find((p) => p.id === t.id) : t?.kind === 'pot' ? d.pot ?? undefined : undefined;
  const patchItem = (t: ItemSel, patch: Partial<Item>) => setS((cur) => {
    if (!cur) return cur;
    if (t.kind === 'pot') return cur.pot ? { ...cur, pot: { ...cur.pot, ...patch } } : cur;
    const key = t.kind === 'pad' ? 'pads' : 'accents';
    return { ...cur, [key]: cur[key].map((p) => (p.id === t.id ? { ...p, ...patch } : p)) };
  });
  const anchorOf = (it: Item, t: ItemSel) => (t.kind === 'pot' ? lib.get(it.kind)?.soil_y ?? 0.2 : 0.5);

  // ---------- cử chỉ trên ảnh: 1 ngón kéo / chạm, 2 ngón phóng to (hoặc đổi cỡ, xoay chi tiết đang chọn) ----------
  const toImage = (cx_: number, cy_: number): [number, number] => {
    const m = svgRef.current?.getScreenCTM?.();
    if (!m) return [0, 0];
    const p = new DOMPoint(cx_, cy_).matrixTransform(m.inverse());
    return [clamp(p.x, 0, W), clamp(p.y, 0, H)];
  };
  const clampView = (v: View): View => ({ k: v.k, tx: clamp(v.tx, box.w * (1 - v.k), 0), ty: clamp(v.ty, box.h * (1 - v.k), 0) });
  const parseHit = (target: EventTarget | null): Hit => {
    const raw = (target as Element | null)?.closest?.('[data-hit]')?.getAttribute('data-hit');
    if (!raw) return null;
    const [kind, id] = raw.split(':');
    return (id ? { kind, id } : { kind }) as Hit;
  };
  const onDown = (e: RPointerEvent) => {
    boxRef.current?.setPointerCapture?.(e.pointerId);
    pts.current.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.current.size === 2) {
      const [a, b] = [...pts.current.values()];
      const prev = g.current;
      if (prev && 'moved' in prev && prev.t !== 'pinch' && (prev.t === 'drag' || prev.t === 'handle') && !prev.moved) unsnap();
      const item = isItemSel(sel) ? itemOf(sel) ?? null : null;
      if (item) snap();
      const r = boxRef.current?.getBoundingClientRect();
      g.current = {
        t: 'pinch', d0: Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, a0: Math.atan2(b[1] - a[1], b[0] - a[0]),
        mid0: [(a[0] + b[0]) / 2 - (r?.left ?? 0), (a[1] + b[1]) / 2 - (r?.top ?? 0)], item, view, moved: false,
      };
      return;
    }
    if (pts.current.size > 2) return;
    const hit = parseHit(e.target);
    const [x, y] = toImage(e.clientX, e.clientY);
    if (hit?.kind === 'handle') {
      snap();
      g.current = { t: 'handle', sx: e.clientX, sy: e.clientY, moved: false };
      return;
    }
    if (hit && hit.kind !== 'branch') {
      const target = hit as NonNullable<Sel>;
      const at: [number, number] = hit.kind === 'apex' ? s.apex
        : hit.kind === 'new' ? (() => { const n = s.news.find((q) => q.id === hit.id)!; return [n.x, n.y] as [number, number]; })()
        : (() => { const it = itemOf(target)!; return [it.x, it.y] as [number, number]; })();
      setSel(target);
      snap();
      g.current = { t: 'drag', target, dx: at[0] - x, dy: at[1] - y, sx: e.clientX, sy: e.clientY, moved: false };
      return;
    }
    g.current = { t: 'tap', hit, sx: e.clientX, sy: e.clientY, moved: false, pan: view.k > 1 ? view : null };
  };

  const onMove = (e: RPointerEvent) => {
    if (!pts.current.has(e.pointerId)) return;
    pts.current.set(e.pointerId, [e.clientX, e.clientY]);
    const gg = g.current;
    if (!gg) return;
    if (gg.t === 'pinch') {
      if (pts.current.size < 2) return;
      const [a, b] = [...pts.current.values()];
      const f = Math.hypot(b[0] - a[0], b[1] - a[1]) / gg.d0;
      gg.moved = true;
      if (gg.item && isItemSel(sel)) {
        const turn = ((Math.atan2(b[1] - a[1], b[0] - a[0]) - gg.a0) * 180) / Math.PI;
        patchItem(sel, { w: clamp(gg.item.w * f, u(24), W * 1.2), ...(sel.kind === 'pad' ? { rot: clamp(gg.item.rot + turn, -60, 60) } : {}) });
        return;
      }
      const r = boxRef.current?.getBoundingClientRect();
      const mid: [number, number] = [(a[0] + b[0]) / 2 - (r?.left ?? 0), (a[1] + b[1]) / 2 - (r?.top ?? 0)];
      const k = clamp(gg.view.k * f, 1, MAX_ZOOM);
      const c = [(gg.mid0[0] - gg.view.tx) / gg.view.k, (gg.mid0[1] - gg.view.ty) / gg.view.k];
      setView(clampView({ k, tx: mid[0] - c[0] * k, ty: mid[1] - c[1] * k }));
      return;
    }
    if (!gg.moved && Math.hypot(e.clientX - gg.sx, e.clientY - gg.sy) < TAP_PX) return;
    gg.moved = true;
    const [x, y] = toImage(e.clientX, e.clientY);
    if (gg.t === 'drag') {
      const nx = x + gg.dx, ny = y + gg.dy, t = gg.target;
      if (t.kind === 'apex') setS((cur) => cur && { ...cur, apex: [nx, ny] });
      else if (t.kind === 'new') setS((cur) => cur && { ...cur, news: cur.news.map((n) => (n.id === t.id ? { ...n, x: nx, y: ny, dir: n.dir === 'up' ? 'up' : nx < bx ? 'left' : 'right' } : n)) });
      else if (t.kind === 'pot') patchItem(t, { x: nx }); // chậu chỉ trượt ngang: gốc cây luôn ở mặt đất
      else patchItem(t, { x: nx, y: ny });
    } else if (gg.t === 'handle' && isItemSel(sel)) {
      const it = itemOf(sel);
      if (!it) return;
      if (sel.kind === 'pot') return patchItem(sel, { w: clamp(2 * Math.abs(x - it.x), u(40), W * 1.2) });
      const sg = x < it.x ? -1 : 1;
      const w = clamp(2 * Math.hypot(x - it.x, y - it.y), u(24), W * 1.2);
      patchItem(sel, sel.kind === 'pad' ? { w, rot: clamp((Math.atan2(sg * (y - it.y), sg * (x - it.x)) * 180) / Math.PI, -60, 60) } : { w });
    } else if (gg.t === 'tap' && gg.pan) {
      setView(clampView({ ...gg.pan, tx: gg.pan.tx + e.clientX - gg.sx, ty: gg.pan.ty + e.clientY - gg.sy }));
    }
  };

  const onUp = (e: RPointerEvent, cancelled = false) => {
    pts.current.delete(e.pointerId);
    const gg = g.current;
    if (!gg) return;
    if (gg.t === 'pinch') {
      if (pts.current.size === 0) {
        if (gg.item && !gg.moved) unsnap();
        g.current = null;
      }
      return;
    }
    if (!gg.moved) {
      if (gg.t === 'drag' || gg.t === 'handle') unsnap();
      if (gg.t === 'tap' && !cancelled) {
        const hit = gg.hit;
        if (hit?.kind === 'branch') commit({ ...s, removed: s.removed.includes(hit.id) ? s.removed.filter((x) => x !== hit.id) : [...s.removed, hit.id] });
        else setSel(null);
      }
    }
    g.current = null;
  };

  // ---------- thêm / sửa chi tiết ----------
  const add = (sp: Sprite) => {
    if (sp.category === 'pot') {
      const base = s.pot ?? defaultPot(data, lib, sp.key);
      if (base) commit({ ...s, pot: { ...base, kind: sp.key } });
      return;
    }
    const full = sp.category === 'accent' ? s.accents.length >= LIMIT.accents : s.pads.length >= LIMIT.pads;
    if (full) {
      setError(sp.category === 'accent' ? `Tối đa ${LIMIT.accents} rêu, đá.` : `Tối đa ${LIMIT.pads} tầng lá.`);
      return;
    }
    setError(null);
    if (sp.category === 'accent') {
      const d = data.trunk.base_diameter_px;
      const it: Item = { id: uid(), kind: sp.key, x: bx + (sp.key === 'rock' ? d * 1.4 : 0), y: by - d * 0.1, w: sp.key === 'moss' ? d * 1.6 : d * 0.8, rot: 0, flip: false };
      commit({ ...s, accents: [...s.accents, it] });
      setSel({ kind: 'accent', id: it.id });
      return;
    }
    const top = s.pads.length ? Math.min(...s.pads.map((p) => p.y)) : by - trunkH * 0.35;
    const w = sp.category === 'apex' ? trunkH * 0.3 : s.pads.length ? Math.min(...s.pads.map((p) => p.w)) * 0.85 : trunkH * 0.6;
    const it: Item = { id: uid(), kind: sp.key, x: s.apex[0], y: Math.max(w * sp.aspect, top - w * sp.aspect * 1.4), w, rot: 0, flip: false };
    commit({ ...s, pads: [...s.pads, it] });
    setSel({ kind: 'pad', id: it.id });
  };
  const addNew = () => {
    if (s.news.length >= LIMIT.news) {
      setError(`Tối đa ${LIMIT.news} cành mới.`);
      return;
    }
    const n: NewB = { id: uid(), x: bx - data.trunk.base_diameter_px * 0.4, y: by - trunkH * 0.4, dir: 'left' };
    commit({ ...s, news: [...s.news, n] });
    setSel({ kind: 'new', id: n.id });
  };
  const removeSel = () => {
    if (!sel) return;
    if (sel.kind === 'pad') commit({ ...s, pads: s.pads.filter((p) => p.id !== sel.id) });
    else if (sel.kind === 'accent') commit({ ...s, accents: s.accents.filter((p) => p.id !== sel.id) });
    else if (sel.kind === 'pot') commit({ ...s, pot: null });
    else if (sel.kind === 'new') commit({ ...s, news: s.news.filter((n) => n.id !== sel.id) });
    setSel(null);
  };
  const duplicate = () => {
    const it = itemOf(sel);
    if (!it || !sel || (sel.kind !== 'pad' && sel.kind !== 'accent')) return;
    const list = sel.kind === 'pad' ? s.pads : s.accents;
    if (list.length >= (sel.kind === 'pad' ? LIMIT.pads : LIMIT.accents)) return setError(sel.kind === 'pad' ? `Tối đa ${LIMIT.pads} tầng lá.` : `Tối đa ${LIMIT.accents} rêu, đá.`);
    const h = it.w * aspect(it.kind);
    const copy: Item = { ...it, id: uid(), ...(sel.kind === 'pad' ? { y: Math.max(h, it.y - h * 1.6), w: it.w * 0.85 } : { x: it.x + it.w * 0.7 }) };
    commit(sel.kind === 'pad' ? { ...s, pads: [...s.pads, copy] } : { ...s, accents: [...s.accents, copy] });
    setSel({ kind: sel.kind, id: copy.id });
  };
  const cycleShape = () => { // rộng → dẹt → ngọn, cùng loại lá
    const it = itemOf(sel);
    if (!it || sel?.kind !== 'pad') return;
    const [lf, shape] = it.kind.split('_');
    const order = ['wide', 'flat', 'apex'];
    const next = `${lf}_${order[(order.indexOf(shape) + 1) % order.length]}`;
    if (lib.has(next)) { snap(); patchItem(sel, { kind: next }); }
  };

  // ---------- lưu / xem thử / nhờ góp ý ----------
  const save = async (): Promise<string | null> => {
    setError(null);
    try {
      return (await studioApi.save(jobId, toInput(s, data, lib))).option_id;
    } catch (e) {
      setError((e as ApiError).message);
      return null;
    }
  };
  const submitEntry = async () => {
    if (!challengeId) return;
    setBusy('save');
    setError(null);
    try {
      await communityApi.submitEntry(challengeId, toInput(s, data, lib));
      navigate(`/thu-thach/${challengeId}`);
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(null);
    }
  };
  const saveAndChoose = async () => {
    setBusy('save');
    const id = await save();
    if (id) navigate(`/chon/${jobId}?option=${id}`);
    else setBusy(null);
  };
  const quickPreview = async () => {
    setBusy('preview');
    if (await save()) {
      try {
        setPreview(await studioApi.startPreview(jobId));
      } catch (e) {
        setError((e as ApiError).message);
      }
    }
    setBusy(null);
  };
  const askFriends = async () => {
    setBusy('share');
    if (await save()) {
      try {
        const r = await studioApi.share(jobId);
        const url = new URL(r.url, window.location.origin).toString();
        setShared(url);
        setBusy(null);
        if (navigator.share) await navigator.share({ title: 'Nhờ góp ý dáng cây', text: 'Mình tự thiết kế dáng cho phôi này, góp ý giúp mình nhé:', url }).catch(() => null);
        else await navigator.clipboard?.writeText(url).catch(() => null);
      } catch (e) {
        setError((e as ApiError).message);
      }
    }
    setBusy(null);
  };

  // ---------- vẽ ----------
  const selItem = isItemSel(sel) ? itemOf(sel) : undefined;
  const selNew = sel?.kind === 'new' ? s.news.find((n) => n.id === sel.id) : undefined;
  const pot = s.pot ? lib.get(s.pot.kind) : undefined;
  const styleName = data.styles.find((x) => x.key === s.style_key)?.name_vi ?? s.style_key;
  const kept = data.branches.length - s.removed.length;

  const sprite = (it: Item, hit: string, anchor: number, active: boolean, dim = false) => {
    const h = it.w * aspect(it.kind);
    const hh = Math.max(h, u(TOUCH_PX));
    return (
      <g key={it.id} data-hit={active ? hit : undefined} transform={`translate(${it.x} ${it.y}) rotate(${it.rot})`} opacity={dim ? 0.4 : 1}
        style={{ pointerEvents: active ? 'auto' : 'none' }} className={active ? 'cursor-grab' : undefined}>
        <rect x={-it.w / 2} y={-h * anchor + h / 2 - hh / 2} width={it.w} height={hh} fill="transparent" />
        <image href={`/studio/${lib.get(it.kind)?.file ?? ''}`} x={-it.w / 2} y={-h * anchor} width={it.w} height={h} preserveAspectRatio="none"
          transform={it.flip ? 'scale(-1 1)' : undefined} />
      </g>
    );
  };
  const selection = () => {
    if (!selItem || !isItemSel(sel) || !edit) return null;
    const anchor = anchorOf(selItem, sel);
    const h = selItem.w * aspect(selItem.kind);
    const r = (selItem.rot * Math.PI) / 180;
    const [hx, hy] = sel.kind === 'pot' ? [selItem.x + selItem.w / 2, selItem.y - h * anchor + h / 2]
      : [selItem.x + (Math.cos(r) * selItem.w) / 2, selItem.y + (Math.sin(r) * selItem.w) / 2];
    return (
      <g>
        <rect transform={`translate(${selItem.x} ${selItem.y}) rotate(${selItem.rot})`} x={-selItem.w / 2} y={-h * anchor} width={selItem.w} height={h}
          fill="none" stroke="var(--surface)" strokeWidth={u(3)} pointerEvents="none" />
        <rect transform={`translate(${selItem.x} ${selItem.y}) rotate(${selItem.rot})`} x={-selItem.w / 2} y={-h * anchor} width={selItem.w} height={h}
          fill="none" stroke="var(--ink)" strokeWidth={u(1.5)} strokeDasharray={`${u(6)} ${u(4)}`} pointerEvents="none" />
        <g data-hit="handle" className="cursor-nwse-resize" aria-label="Kéo để đổi cỡ và xoay">
          <circle cx={hx} cy={hy} r={u(TOUCH_PX / 2)} fill="transparent" />
          <circle cx={hx} cy={hy} r={u(11)} fill="var(--surface)" stroke="var(--ink)" strokeWidth={u(2)} />
          <path d={`M${hx - u(4)},${hy} h${u(8)} M${hx},${hy - u(4)} v${u(8)}`} stroke="var(--ink)" strokeWidth={u(1.6)} />
        </g>
      </g>
    );
  };

  // ---------- bảng công cụ phía dưới ----------
  const itemPanel = selItem && isItemSel(sel) ? (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="line-clamp-1 text-caption font-semibold">{sel.kind === 'pad' ? `Tầng lá ${padName(s.pads.indexOf(selItem))}` : lib.get(selItem.kind)?.label_vi}</span>
        <button type="button" onClick={() => setSel(null)} className="flex min-h-touch items-center gap-1 rounded-btn px-3 text-caption font-semibold text-primary-ink">
          <Check size={16} aria-hidden="true" />Xong
        </button>
      </div>
      <div className={cx('grid gap-2', sel.kind === 'pad' ? 'grid-cols-4' : sel.kind === 'accent' ? 'grid-cols-3' : 'grid-cols-1')}>
        {sel.kind !== 'pot' ? <ToolButton icon={<FlipHorizontal2 size={18} aria-hidden="true" />} label="Lật" onClick={() => { snap(); patchItem(sel, { flip: !selItem.flip }); }} /> : null}
        {sel.kind === 'pad' ? <ToolButton icon={<LeafIcon size={18} aria-hidden="true" />} label="Đổi kiểu" onClick={cycleShape} /> : null}
        {sel.kind !== 'pot' ? <ToolButton icon={<Copy size={18} aria-hidden="true" />} label="Nhân bản" onClick={duplicate} /> : null}
        <ToolButton icon={<Trash2 size={18} aria-hidden="true" />} label="Xóa" onClick={removeSel} danger />
      </div>
      <Slider label="To / nhỏ" value={Math.round(selItem.w)} min={Math.round(u(24))} max={Math.round(W)} onStart={snap} onChange={(v) => patchItem(sel, { w: v })} />
      {sel.kind === 'pad' ? <Slider label="Nghiêng" value={Math.round(selItem.rot)} min={-60} max={60} onStart={snap} onChange={(v) => patchItem(sel, { rot: v })} /> : null}
    </div>
  ) : null;

  const branchPanel = (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption">
        <span className="text-ink-muted">Chạm vào cành để đổi</span>
        <span className="font-semibold text-leaf">Giữ {kept}</span>
        <span className="font-semibold text-seal">Cắt {s.removed.length}</span>
      </div>
      {selNew ? (
        <>
          <Segmented<'left' | 'right' | 'up'> label="Hướng cành mới" value={selNew.dir} options={[['left', 'Sang trái'], ['up', 'Lên trên'], ['right', 'Sang phải']]}
            onChange={(dir) => commit({ ...s, news: s.news.map((n) => (n.id === selNew.id ? { ...n, dir } : n)) })} />
          <div className="grid grid-cols-2 gap-2">
            <ToolButton icon={<Check size={18} aria-hidden="true" />} label="Xong" onClick={() => setSel(null)} />
            <ToolButton icon={<Trash2 size={18} aria-hidden="true" />} label="Xóa cành mới" onClick={removeSel} danger />
          </div>
        </>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <ToolButton icon={<Sprout size={18} aria-hidden="true" />} label="Cành mới" onClick={addNew} />
          <div className="flex min-h-[52px] items-center gap-2 rounded-btn bg-surface-2 px-3 text-label text-ink-muted">
            <span className="inline-block h-3 w-3 flex-none rounded-full bg-ink" aria-hidden="true" />Kéo chấm đen để đặt ngọn
          </div>
        </div>
      )}
    </div>
  );

  const sprites = [...lib.values()];
  const padPanel = (
    <div className="flex flex-col gap-2">
      <Row>
        {(Object.keys(LEAF_VI) as Leaf[]).map((l) => (
          <button key={l} type="button" aria-pressed={leaf === l} onClick={() => setLeaf(l)}
            className={cx('min-h-touch flex-none rounded-chip border px-3 text-label', leaf === l ? 'border-ink bg-surface-2 font-semibold text-ink' : 'border-line text-ink-muted')}>{LEAF_VI[l]}</button>
        ))}
      </Row>
      <Row>{sprites.filter((x) => (x.category === 'pad' || x.category === 'apex') && x.leaf === leaf).map((sp) => <Thumb key={sp.key} sprite={sp} onPick={() => add(sp)} />)}</Row>
    </div>
  );
  const potPanel = (
    <div className="flex flex-col gap-1">
      <Row>{sprites.filter((x) => x.category === 'pot').map((sp) => <Thumb key={sp.key} sprite={sp} onPick={() => add(sp)} active={s.pot?.kind === sp.key} />)}</Row>
      {s.pot ? <Slider label="Cỡ chậu" value={Math.round(s.pot.w)} min={Math.round(u(40))} max={Math.round(W)} onStart={snap} onChange={(v) => patchItem({ kind: 'pot' }, { w: v })} /> : null}
    </div>
  );
  const accentPanel = <Row>{sprites.filter((x) => x.category === 'accent').map((sp) => <Thumb key={sp.key} sprite={sp} onPick={() => add(sp)} />)}</Row>;
  const donePanel = (
    <div className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-caption font-medium">Thế cây
        <select value={s.style_key} onChange={(e) => commit({ ...s, style_key: e.target.value })}
          className="min-h-touch rounded-btn border border-line-strong bg-surface px-3 text-body text-ink">
          {data.styles.map((x) => <option key={x.key} value={x.key}>{x.name_vi}{x.suggested ? ' · hợp phôi' : ''}</option>)}
        </select>
      </label>
      {hints.length ? <Notice tone="info"><ul className="m-0 flex list-none flex-col gap-1 p-0">{hints.map((h) => <li key={h}>{h}</li>)}</ul></Notice> : null}
      {error && challengeId ? <Notice tone="danger">{error}</Notice> : null}
      {challengeId ? <Button onClick={submitEntry} loading={busy === 'save'} loadingLabel="Đang gửi…" disabled={busy !== null}>Gửi bài dự thi · {styleName}</Button> : null}
      {challengeId ? null : <>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" size="touch" className="whitespace-nowrap !px-2" onClick={quickPreview} loading={busy === 'preview'} loadingLabel="Đang gửi…"
          disabled={busy !== null || preview?.state === 'running' || preview?.remaining === 0}>
          <Sparkles size={16} aria-hidden="true" />Xem thử AI{preview ? ` · còn ${preview.remaining}` : ''}
        </Button>
        <Button variant="secondary" size="touch" className="whitespace-nowrap !px-2" onClick={askFriends} loading={busy === 'share'} loadingLabel="Đang tạo…" disabled={busy !== null}>
          <Share2 size={16} aria-hidden="true" />Nhờ góp ý
        </Button>
      </div>
      {preview?.state === 'running' ? <p className="m-0 text-label text-ink-subtle" aria-live="polite">Đang vẽ thử, khoảng 30 giây…</p> : null}
      {preview?.state === 'failed' ? <Notice tone="warn">Chưa tạo được ảnh xem thử, thử lại sau (không tính lần).</Notice> : null}
      {preview?.url ? (
        <button type="button" onClick={() => setShowPreview(true)} className="flex min-h-touch items-center gap-3 rounded-btn border border-line p-1.5 text-left text-caption">
          <img src={preview.url} alt="" className="h-14 w-14 rounded-img object-cover" />Xem ảnh thử
        </button>
      ) : null}
      {shared ? <Notice tone="success">Đã tạo link nhờ góp ý: <a href={shared} target="_blank" rel="noreferrer" className="break-all underline">{shared}</a></Notice> : null}
      {data.templates.length ? (
        <div>
          <div className="mb-1 text-label text-ink-muted">Bắt đầu lại từ mẫu</div>
          <Row>
            {data.templates.map((t) => (
              <button key={t.rank} type="button" onClick={() => { commit(fromTemplate(data, t, leaf, lib)); setSel(null); }}
                className="flex min-h-touch flex-none items-center gap-1 rounded-btn border border-line px-3 text-caption font-medium">
                <Plus size={14} aria-hidden="true" />{data.styles.find((x) => x.key === t.style_key)?.name_vi ?? t.style_key}
              </button>
            ))}
          </Row>
        </div>
      ) : null}
      <Button onClick={saveAndChoose} loading={busy === 'save'} loadingLabel="Đang lưu…" disabled={busy !== null}>Lưu thiết kế · {styleName}</Button>
      <span className="text-center text-label text-ink-subtle">Lưu, xem thử, nhờ góp ý miễn phí · tạo ảnh tương lai dùng 1 lượt</span>
      </>}
    </div>
  );
  const panel = itemPanel ?? { branch: branchPanel, pad: padPanel, pot: potPanel, accent: accentPanel, done: donePanel }[tab];

  return (
    <div className="mx-auto flex h-dvh max-w-content flex-col overflow-hidden bg-bg">
      <header className="flex h-14 flex-none items-center gap-1 border-b border-line px-1">
        <Link to={back} aria-label="Quay lại" className="flex h-touch w-touch flex-none items-center justify-center rounded-btn text-ink"><ChevronLeft size={22} /></Link>
        <h1 className="min-w-0 flex-1 truncate text-[15px] font-semibold">{challengeId ? 'Bài dự thi' : 'Tự thiết kế'}</h1>
        <button type="button" aria-label="Hoàn tác" onClick={undo} disabled={!history.length}
          className="flex h-touch w-touch items-center justify-center rounded-btn text-ink disabled:text-ink-subtle"><Undo2 size={20} /></button>
        <button type="button" aria-label="Xem như thật" aria-pressed={real} onClick={() => { setReal(!real); setSel(null); }}
          className={cx('flex h-touch w-touch items-center justify-center rounded-btn', real ? 'bg-surface-2 text-ink' : 'text-ink')}>{real ? <EyeOff size={20} /> : <Eye size={20} />}</button>
        <button type="button" onClick={() => setTab('done')} className="mr-1 min-h-touch rounded-btn bg-primary px-4 text-caption font-semibold text-primary-on">Lưu</button>
      </header>

      <div className="relative min-h-0 flex-1 overflow-hidden bg-photo">
        <div ref={boxRef} className="absolute inset-0 touch-none select-none"
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={(e) => onUp(e)} onPointerCancel={(e) => onUp(e, true)}>
          <div className="absolute inset-0 origin-top-left" style={{ transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.k})` }}>
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="application"
              aria-label="Bản thiết kế: chạm cành để giữ hoặc cắt, kéo chi tiết để đặt, hai ngón để phóng to">
              <image href={data.photo_url} width={W} height={H} />
              {!peek ? (
                <g>
                  {s.pot && pot ? sprite(s.pot, 'pot', pot.soil_y ?? 0.2, !branchMode) : null}
                  {s.accents.map((a) => sprite(a, `accent:${a.id}`, 0.5, !branchMode))}
                  {edit ? data.branches.map((b, i) => {
                    const [ex, ey] = branchEnd(b, trunkH);
                    const cut = s.removed.includes(b.id);
                    const mx = (b.start_px[0] + ex) / 2, my = (b.start_px[1] + ey) / 2;
                    const c = cut ? 'var(--seal)' : 'var(--leaf)';
                    return (
                      <g key={b.id} data-hit={branchMode ? `branch:${b.id}` : undefined} opacity={branchMode ? 1 : 0.5} style={{ pointerEvents: branchMode ? 'auto' : 'none' }}
                        className="cursor-pointer" role="button" aria-label={`Cành ${i + 1}: ${cut ? 'cắt' : 'giữ'}`}>
                        <line x1={b.start_px[0]} y1={b.start_px[1]} x2={ex} y2={ey} stroke="transparent" strokeWidth={u(TOUCH_PX)} strokeLinecap="round" />
                        <line x1={b.start_px[0]} y1={b.start_px[1]} x2={ex} y2={ey} stroke={c} strokeWidth={u(4)} strokeDasharray={cut ? `${u(8)} ${u(6)}` : undefined} strokeLinecap="round" />
                        {cut ? <path d={`M${mx - u(8)},${my - u(8)} L${mx + u(8)},${my + u(8)} M${mx + u(8)},${my - u(8)} L${mx - u(8)},${my + u(8)}`} stroke="var(--seal)" strokeWidth={u(3.5)} /> : null}
                        <circle cx={ex} cy={ey} r={u(13)} fill={c} stroke="var(--surface)" strokeWidth={u(2)} />
                        <text x={ex} y={ey} textAnchor="middle" dy="0.35em" fontSize={u(13)} fontWeight={700} fill="var(--surface)" pointerEvents="none">{i + 1}</text>
                      </g>
                    );
                  }) : null}
                  {s.pads.map((p) => sprite(p, `pad:${p.id}`, 0.5, !branchMode, branchMode && edit))}
                  {edit && !branchMode ? s.pads.map((p, i) => (
                    <g key={`l${p.id}`} pointerEvents="none">
                      <circle cx={p.x} cy={p.y} r={u(10)} fill="var(--ink)" fillOpacity={0.6} />
                      <text x={p.x} y={p.y} textAnchor="middle" dy="0.35em" fontSize={u(11)} fontWeight={700} fill="var(--surface)">{padName(i)}</text>
                    </g>
                  )) : null}
                  {edit ? s.news.map((n) => {
                    const v = { left: [-1, -0.3], right: [1, -0.3], up: [0, -1] }[n.dir];
                    const len = trunkH * 0.13;
                    const ex = n.x + v[0] * len, ey = n.y + v[1] * len;
                    const on = sel?.kind === 'new' && sel.id === n.id;
                    return (
                      <g key={n.id} data-hit={branchMode ? `new:${n.id}` : undefined} opacity={branchMode ? 1 : 0.5} style={{ pointerEvents: branchMode ? 'auto' : 'none' }}
                        className="cursor-grab" role="button" aria-label="Cành mới — kéo để đổi chỗ">
                        <line x1={n.x} y1={n.y} x2={ex} y2={ey} stroke="transparent" strokeWidth={u(TOUCH_PX)} strokeLinecap="round" />
                        <line x1={n.x} y1={n.y} x2={ex} y2={ey} stroke="var(--brass)" strokeWidth={u(on ? 6 : 4)} strokeLinecap="round" />
                        <circle cx={ex} cy={ey} r={u(7)} fill="var(--brass)" />
                        <circle cx={n.x} cy={n.y} r={u(8)} fill="var(--surface)" stroke="var(--brass)" strokeWidth={u(3)} />
                      </g>
                    );
                  }) : null}
                  {edit ? (
                    <g data-hit={branchMode ? 'apex' : undefined} opacity={branchMode ? 1 : 0.5} style={{ pointerEvents: branchMode ? 'auto' : 'none' }}
                      className="cursor-grab" role="button" aria-label="Điểm ngọn — kéo để đổi">
                      <circle cx={s.apex[0]} cy={s.apex[1]} r={u(TOUCH_PX / 2)} fill="transparent" />
                      <circle cx={s.apex[0]} cy={s.apex[1]} r={u(9)} fill="var(--ink)" stroke="var(--surface)" strokeWidth={u(3)} />
                    </g>
                  ) : null}
                  {selection()}
                </g>
              ) : null}
            </svg>
          </div>
        </div>
        <div className="pointer-events-none absolute inset-x-2 bottom-2 flex items-end justify-between gap-2">
          <button type="button" aria-label="Giữ để xem ảnh gốc" onPointerDown={() => setPeek(true)} onPointerUp={() => setPeek(false)} onPointerLeave={() => setPeek(false)}
            onContextMenu={(e) => e.preventDefault()}
            className="pointer-events-auto flex h-touch items-center gap-1.5 rounded-full bg-surface px-3 text-label font-medium text-ink shadow-card">
            <Eye size={16} aria-hidden="true" />Ảnh gốc
          </button>
          {preview?.state === 'running' ? <span className="rounded-full bg-surface px-3 py-2 text-label text-ink-muted shadow-card">Đang vẽ thử…</span> : null}
          {preview?.url && !showPreview && tab !== 'done' ? (
            <button type="button" onClick={() => setShowPreview(true)} className="pointer-events-auto flex h-touch items-center gap-1.5 rounded-full bg-surface px-3 text-label font-medium text-ink shadow-card">
              <Sparkles size={16} aria-hidden="true" />Ảnh thử
            </button>
          ) : null}
          {view.k > 1 ? (
            <button type="button" aria-label="Thu về vừa màn hình" onClick={() => setView({ k: 1, tx: 0, ty: 0 })}
              className="pointer-events-auto flex h-touch w-touch items-center justify-center rounded-full bg-surface text-ink shadow-card"><Minimize2 size={18} /></button>
          ) : null}
        </div>
      </div>

      <div className="flex-none border-t border-line bg-surface">
        <div className="h-[clamp(200px,30dvh,240px)] overflow-y-auto px-gutter pb-2 pt-3">
          {error ? <div className="mb-2"><Notice tone="danger">{error}</Notice></div> : null}
          {panel}
        </div>
        <nav className="grid grid-cols-5 border-t border-line pb-[env(safe-area-inset-bottom)]" aria-label="Công cụ">
          {TABS.map(([key, label, Icon]) => (
            <button key={key} type="button" aria-pressed={tab === key} onClick={() => { setTab(key); setSel(null); setError(null); }}
              className={cx('relative flex min-h-[56px] flex-col items-center justify-center gap-0.5 text-label', tab === key ? 'font-semibold text-ink' : 'text-ink-muted')}>
              {tab === key ? <span className="absolute inset-x-3 top-0 h-0.5 rounded-full bg-ink" aria-hidden="true" /> : null}
              <Icon size={20} aria-hidden="true" />{label}
              {key === 'done' && hints.length ? <span className="absolute right-[calc(50%-18px)] top-2 h-2 w-2 rounded-full bg-seal" aria-hidden="true" /> : null}
            </button>
          ))}
        </nav>
      </div>

      {showPreview && preview?.url ? (
        <div className="fixed inset-0 z-50 flex flex-col p-3" style={{ background: 'color-mix(in srgb, var(--ink) 92%, transparent)' }} role="dialog" aria-label="Ảnh xem thử">
          <div className="flex items-center justify-between pb-2">
            <span className="rounded-chip bg-surface px-2 py-0.5 text-label font-medium text-ink-muted">Minh họa</span>
            <button type="button" aria-label="Đóng" onClick={() => setShowPreview(false)} className="flex h-touch w-touch items-center justify-center rounded-full bg-surface text-ink"><X size={20} /></button>
          </div>
          <img src={preview.url} alt="Ảnh xem thử nhanh theo thiết kế của bạn" className="min-h-0 flex-1 object-contain" />
        </div>
      ) : null}
    </div>
  );
}
