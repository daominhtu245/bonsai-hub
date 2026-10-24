import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Eye, FlipHorizontal2, Plus, Share2, Sparkles, Sprout, Trash2, Undo2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Button, Notice, Segmented, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import {
  studioApi, type DesignInput, type Preview, type Sprite, type StudioData, type StudioTemplate,
} from '@/lib/studio';

// ---------- mô hình trên màn hình (tọa độ = pixel ảnh gốc) ----------
type Leaf = 'ficus' | 'fine' | 'needle' | 'strap';
interface Item { id: string; kind: string; x: number; y: number; w: number; rot: number; flip: boolean } // x, y = tâm (chậu: tâm mặt đất)
interface NewB { id: string; x: number; y: number; dir: 'left' | 'right' | 'up' }
interface Design { style_key: string; removed: string[]; pads: Item[]; accents: Item[]; pot: Item | null; news: NewB[]; apex: [number, number] }
type Sel = { kind: 'pad' | 'accent' | 'new'; id: string } | { kind: 'pot' } | { kind: 'apex' } | null;
type Tab = 'pad' | 'apex' | 'pot' | 'accent';

const LEAF_OF: Record<string, Leaf> = { si: 'ficus', sanh: 'ficus', mai_chieu_thuy: 'fine', linh_sam: 'fine', tung_la_han: 'strap' };
const LEAF_VI: Record<Leaf, string> = { ficus: 'Lá si, sanh', fine: 'Lá li ti', needle: 'Lá kim', strap: 'Lá dải' };
const padName = (i: number) => String.fromCharCode(65 + i); // tầng lá A, B, C… (cành dùng số 1, 2, 3)
const LIMIT = { pads: 12, accents: 6, news: 6 }; // trùng giới hạn của UserDesignIn (server)
let seq = 0;
const uid = () => `x${++seq}`;

function branchEnd(b: StudioData['branches'][number], trunkH: number): [number, number] {
  if (b.end_px) return b.end_px;
  const dir = { left: [-1, -0.3], right: [1, -0.3], up: [0, -1], back: [0.55, -0.55], front: [-0.55, -0.55] }[b.direction];
  const len = trunkH * ({ thick: 0.2, medium: 0.15, thin: 0.1 }[b.thickness]);
  const n = Math.hypot(dir[0], dir[1]);
  return [b.start_px[0] + (dir[0] / n) * len, b.start_px[1] + (dir[1] / n) * len];
}

/** Tầng lá theo khung tán của phương án AI: dưới rộng, lên dẹt và nhỏ dần, trên cùng là ngọn; so le trái phải. */
function padsFromTemplate(d: StudioData, t: StudioTemplate, leaf: Leaf): Item[] {
  const [ax, ay] = t.apex ?? d.candidate_apex_px;
  const sw = t.silhouette?.width_px ?? d.trunk.height_px * 0.9;
  const sh = t.silhouette?.height_px ?? d.trunk.height_px * 0.75;
  const n = Math.max(2, Math.min(7, t.pads || 4));
  const bottom = Math.min(ay + sh * 0.85, d.trunk.base_point_px[1] - d.trunk.height_px * 0.3);
  const top = ay + sh * 0.05;
  return Array.from({ length: n }, (_, i) => {
    const f = i / (n - 1);
    const last = i === n - 1;
    const side = last ? 0 : i % 2 === 0 ? -1 : 1;
    return {
      id: uid(), kind: `${leaf}_${last ? 'apex' : i % 2 ? 'flat' : 'wide'}`, x: ax + side * sw * 0.2 * (1 - f), y: bottom + (top - bottom) * f,
      w: sw * (last ? 0.32 : 0.62 - 0.3 * f), rot: side * -4, flip: side > 0,
    };
  });
}

function defaultPot(d: StudioData, lib: Map<string, Sprite>, key = 'pot_oval_brown'): Item | null {
  if (!lib.has(key)) return null;
  const [bx, by] = d.trunk.base_point_px;
  return { id: 'pot', kind: key, x: bx, y: by, w: Math.max(d.trunk.base_diameter_px * 3, d.trunk.height_px * 0.75), rot: 0, flip: false };
}

function fromTemplate(d: StudioData, t: StudioTemplate, leaf: Leaf, lib: Map<string, Sprite>): Design {
  const shape = t.pot?.shape;
  const potKey = shape === 'rectangle' ? 'pot_rect_brown' : shape === 'round' ? 'pot_round_blue' : shape === 'cascade_deep' ? 'pot_cascade' : 'pot_oval_brown';
  return { style_key: t.style_key, removed: t.removed, apex: t.apex ?? d.candidate_apex_px, pads: padsFromTemplate(d, t, leaf), accents: [], news: [], pot: defaultPot(d, lib, potKey) };
}

function fromDraft(d: StudioData, x: DesignInput, leaf: Leaf, lib: Map<string, Sprite>): Design {
  const [bx, by] = d.trunk.base_point_px;
  return {
    style_key: x.style_key, removed: x.removed, apex: x.apex ?? d.candidate_apex_px,
    pads: x.pads.map((p) => ({ id: uid(), kind: p.kind && lib.has(p.kind) ? p.kind : `${leaf}_wide`, x: p.center_px[0], y: p.center_px[1], w: p.rx * 2, rot: p.rotation, flip: Boolean(p.flip) })),
    accents: (x.accents ?? []).slice(0, LIMIT.accents).map((a) => ({ id: uid(), kind: a.kind, x: a.center_px[0], y: a.center_px[1], w: a.width, rot: 0, flip: Boolean(a.flip) })),
    news: x.new_branches.map((n) => ({ id: uid(), x: n.at_px[0], y: n.at_px[1], dir: n.direction })),
    pot: x.pot_kind && lib.has(x.pot_kind)
      ? { id: 'pot', kind: x.pot_kind, x: x.pot_x ?? bx, y: by, w: x.pot_width ?? d.trunk.height_px * 0.75, rot: 0, flip: false }
      : defaultPot(d, lib),
  };
}

function toInput(s: Design, d: StudioData, lib: Map<string, Sprite>): DesignInput {
  const pot = s.pot ? lib.get(s.pot.kind) : undefined;
  const off = s.pot ? (s.pot.x - d.trunk.base_point_px[0]) / s.pot.w : 0; // chậu lệch phải → cây lệch trái chậu
  return {
    style_key: s.style_key, removed: s.removed, apex: s.apex,
    pads: s.pads.map((p) => {
      const a = lib.get(p.kind)?.aspect ?? 0.3;
      return { center_px: [Math.round(p.x), Math.round(p.y)], rx: Math.round(p.w / 2), ry: Math.max(1, Math.round((p.w * a) / 2)), rotation: Math.round(p.rot), kind: p.kind, flip: p.flip };
    }),
    new_branches: s.news.map((n) => ({ at_px: [Math.round(n.x), Math.round(n.y)], direction: n.dir })),
    pot: { shape: pot?.pot_shape ?? 'oval', color: pot?.pot_color ?? 'unglazed_brown', position: off > 0.08 ? 'off_center_left' : off < -0.08 ? 'off_center_right' : 'center' },
    pot_kind: s.pot?.kind ?? null, pot_width: s.pot ? Math.round(s.pot.w) : null, pot_x: s.pot ? Math.round(s.pot.x) : null,
    accents: s.accents.map((a) => ({ kind: a.kind as 'moss' | 'rock', center_px: [Math.round(a.x), Math.round(a.y)], width: Math.round(a.w), flip: a.flip })),
  };
}

/** Gợi ý tức thời (chỉ tham khảo, cùng tinh thần bonsai_pipeline/user_design.py). */
function liveHints(d: StudioData, s: Design, lib: Map<string, Sprite>): string[] {
  const out: string[] = [];
  const num = new Map(d.branches.map((b, i) => [b.id, i + 1]));
  if (!s.pads.length) out.push('Chưa có tầng lá — chọn trong thư viện “Tầng lá”.');
  const kept = d.branches.filter((b) => !s.removed.includes(b.id) && (b.direction === 'left' || b.direction === 'right'));
  kept.forEach((a, i) => kept.slice(i + 1).forEach((b) => {
    if (a.direction !== b.direction && Math.abs(a.height_ratio - b.height_ratio) < 0.04) out.push(`Cành ${num.get(a.id)} và ${num.get(b.id)} mọc ngang nhau hai bên — thường nên cắt bớt một cành.`);
  }));
  const h = (p: Item) => p.w * (lib.get(p.kind)?.aspect ?? 0.3);
  s.pads.forEach((a, i) => s.pads.slice(i + 1).forEach((b, j) => {
    if (Math.abs(a.x - b.x) < (a.w + b.w) * 0.35 && Math.abs(a.y - b.y) < (h(a) + h(b)) * 0.3) out.push(`Tầng lá ${padName(i)} và ${padName(i + j + 1)} chồng lên nhau — nên chừa khoảng trống.`);
  }));
  if (s.pads.length && s.apex[1] > Math.min(...s.pads.map((p) => p.y - h(p) / 2)) + 2) out.push('Ngọn đang thấp hơn tầng lá trên cùng.');
  return [...new Set(out)].slice(0, 4);
}

function Slider({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="flex min-h-touch items-center gap-3 text-caption">
      <span className="w-[5.5rem] flex-none whitespace-nowrap text-ink-muted">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[var(--primary)]" />
    </label>
  );
}

function Thumb({ sprite, onPick, active }: { sprite: Sprite; onPick: () => void; active?: boolean }) {
  return (
    <button type="button" onClick={onPick} aria-pressed={active} aria-label={`Thêm ${sprite.label_vi}`}
      className={cx('flex min-h-[84px] flex-col items-center justify-center gap-1 rounded-btn border bg-surface-2 p-1.5 text-label', active ? 'border-ink' : 'border-line hover:border-line-strong')}>
      <img src={`/studio/${sprite.file}`} alt="" className="h-12 w-full object-contain" loading="lazy" />
      <span className="line-clamp-1 text-ink-muted">{sprite.label_vi.split(' · ')[0]}</span>
    </button>
  );
}

/** Tự thiết kế: ghép dáng trên ảnh phôi bằng thư viện chi tiết cây thật (tầng lá, ngọn, chậu, rêu, đá). */
export default function Studio() {
  const { jobId = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<StudioData | null>(null);
  const [lib, setLib] = useState<Map<string, Sprite>>(new Map());
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState<Design | null>(null);
  const [history, setHistory] = useState<Design[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [peek, setPeek] = useState(false);
  const [real, setReal] = useState(false); // "Xem như thật": ẩn nét đánh dấu
  const [tab, setTab] = useState<Tab>('pad');
  const [leaf, setLeaf] = useState<Leaf>('needle');
  const [busy, setBusy] = useState<null | 'save' | 'preview' | 'share'>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [shared, setShared] = useState<string | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);

  useEffect(() => {
    Promise.all([studioApi.get(jobId), studioApi.library().catch(() => [] as Sprite[])]).then(([d, items]) => {
      const m = new Map(items.map((x) => [x.key, x]));
      const lf = LEAF_OF[d.species_key ?? ''] ?? 'needle';
      setLib(m);
      setLeaf(lf);
      setData(d);
      setS(d.draft ? fromDraft(d, d.draft, lf, m) : d.templates[0] ? fromTemplate(d, d.templates[0], lf, m)
        : { style_key: d.styles[0]?.key ?? 'moyogi', removed: [], pads: [], accents: [], news: [], apex: d.candidate_apex_px, pot: defaultPot(d, m) });
    }).catch((e: ApiError) => setError(e.message));
    studioApi.preview(jobId).then(setPreview).catch(() => null);
  }, [jobId]);

  useEffect(() => { // chờ ảnh xem thử
    if (preview?.state !== 'running') return;
    const t = window.setTimeout(() => studioApi.preview(jobId).then(setPreview).catch(() => null), 4000);
    return () => window.clearTimeout(t);
  }, [preview, jobId]);

  const hints = useMemo(() => (data && s ? liveHints(data, s, lib) : []), [data, s, lib]);
  if (!data || !s) {
    return (
      <div className="mx-auto max-w-content"><BackHeader to={`/chon/${jobId}`} title="Tự thiết kế" />
        <div className="p-gutter">{error ? <Notice tone="danger">{error}</Notice> : <Skeleton className="aspect-[3/4] w-full rounded-card" />}</div>
      </div>
    );
  }

  const W = data.width, H = data.height;
  const unit = Math.min(W, H) / 100;
  const trunkH = data.trunk.height_px;
  const [bx, by] = data.trunk.base_point_px;
  const aspect = (k: string) => lib.get(k)?.aspect ?? 0.3;
  const commit = (next: Design) => { setHistory((h) => [...h.slice(-30), s]); setS(next); };
  const undo = () => { const prev = history[history.length - 1]; if (prev) { setS(prev); setHistory(history.slice(0, -1)); setSel(null); } };

  const toImage = (e: { clientX: number; clientY: number }): [number, number] => {
    const m = svg.current?.getScreenCTM?.();
    if (!m) return [0, 0];
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    return [Math.min(Math.max(p.x, 0), W), Math.min(Math.max(p.y, 0), H)];
  };
  const startDrag = (e: RPointerEvent, target: Sel, at: [number, number]) => {
    e.stopPropagation();
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    const [x, y] = toImage(e);
    drag.current = { dx: at[0] - x, dy: at[1] - y, moved: false };
    setHistory((h) => [...h.slice(-30), s]);
    setSel(target);
  };
  const onMove = (e: RPointerEvent) => {
    if (!drag.current || !sel) return;
    const [x, y] = toImage(e);
    const nx = x + drag.current.dx, ny = y + drag.current.dy;
    drag.current.moved = true;
    if (sel.kind === 'apex') setS({ ...s, apex: [nx, ny] });
    else if (sel.kind === 'pot' && s.pot) setS({ ...s, pot: { ...s.pot, x: nx } }); // chậu chỉ trượt ngang: gốc cây luôn ở mặt đất
    else if (sel.kind === 'pad') setS({ ...s, pads: s.pads.map((p) => (p.id === sel.id ? { ...p, x: nx, y: ny } : p)) });
    else if (sel.kind === 'accent') setS({ ...s, accents: s.accents.map((p) => (p.id === sel.id ? { ...p, x: nx, y: ny } : p)) });
    else if (sel.kind === 'new') setS({ ...s, news: s.news.map((n) => (n.id === sel.id ? { ...n, x: nx, y: ny, dir: n.dir === 'up' ? 'up' : nx < bx ? 'left' : 'right' } : n)) });
  };
  const endDrag = () => {
    if (drag.current && !drag.current.moved) setHistory((h) => h.slice(0, -1));
    drag.current = null;
  };

  const add = (sp: Sprite) => {
    if (sp.category === 'pot') {
      const base = s.pot ?? defaultPot(data, lib, sp.key);
      if (base) commit({ ...s, pot: { ...base, kind: sp.key } });
      setSel({ kind: 'pot' });
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
      const it: Item = { id: uid(), kind: sp.key, x: bx + (sp.key === 'rock' ? d * 1.4 : 0), y: by - unit * 1.2, w: sp.key === 'moss' ? d * 1.6 : d * 0.8, rot: 0, flip: false };
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

  const selItem = sel?.kind === 'pad' ? s.pads.find((p) => p.id === sel.id)
    : sel?.kind === 'accent' ? s.accents.find((p) => p.id === sel.id)
    : sel?.kind === 'pot' ? s.pot ?? undefined : undefined;
  const selNew = sel?.kind === 'new' ? s.news.find((n) => n.id === sel.id) : undefined;
  const patchSel = (patch: Partial<Item>, save = false) => {
    if (!selItem || !sel) return;
    const next = sel.kind === 'pot' ? { ...s, pot: { ...selItem, ...patch } }
      : sel.kind === 'pad' ? { ...s, pads: s.pads.map((p) => (p.id === selItem.id ? { ...p, ...patch } : p)) }
      : { ...s, accents: s.accents.map((p) => (p.id === selItem.id ? { ...p, ...patch } : p)) };
    if (save) commit(next);
    else setS(next);
  };
  const removeSel = () => {
    if (!sel) return;
    if (sel.kind === 'pad') commit({ ...s, pads: s.pads.filter((p) => p.id !== sel.id) });
    else if (sel.kind === 'accent') commit({ ...s, accents: s.accents.filter((p) => p.id !== sel.id) });
    else if (sel.kind === 'pot') commit({ ...s, pot: null });
    else if (sel.kind === 'new') commit({ ...s, news: s.news.filter((n) => n.id !== sel.id) });
    setSel(null);
  };
  // Đổi kiểu tầng lá: rộng → dẹt → ngọn, cùng loại lá
  const cycleShape = () => {
    if (!selItem || sel?.kind !== 'pad') return;
    const [lf, shape] = selItem.kind.split('_');
    const order = ['wide', 'flat', 'apex'];
    const next = `${lf}_${order[(order.indexOf(shape) + 1) % order.length]}`;
    if (lib.has(next)) patchSel({ kind: next }, true);
  };

  const save = async (): Promise<string | null> => {
    setError(null);
    try {
      return (await studioApi.save(jobId, toInput(s, data, lib))).option_id;
    } catch (e) {
      setError((e as ApiError).message);
      return null;
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

  const styleName = data.styles.find((x) => x.key === s.style_key)?.name_vi ?? s.style_key;
  const shown = [...lib.values()].filter((x) => x.category === tab && (tab === 'pad' || tab === 'apex' ? x.leaf === leaf : true));
  const pot = s.pot ? lib.get(s.pot.kind) : undefined;
  const tf = (it: Item, h: number, anchor = 0.5) =>
    `translate(${it.x} ${it.y}) rotate(${it.rot}) scale(${it.flip ? -1 : 1} 1) translate(${-it.w / 2} ${-h * anchor})`;
  const isSel = (k: NonNullable<Sel>) => sel?.kind === k.kind && (!('id' in k) || (sel && 'id' in sel && sel.id === k.id));
  const frame = (it: Item, h: number, anchor?: number) => (
    <rect transform={tf(it, h, anchor)} width={it.w} height={h} fill="none" stroke="var(--ink)" strokeDasharray={`${unit} ${unit}`} strokeWidth={unit * 0.3} pointerEvents="none" />
  );
  const sprite = (it: Item, target: NonNullable<Sel>, anchor = 0.5) => {
    const h = it.w * aspect(it.kind);
    return (
      <g onPointerDown={(e) => startDrag(e, target, [it.x, it.y])} className="cursor-grab">
        <image href={`/studio/${lib.get(it.kind)?.file ?? ''}`} width={it.w} height={h} transform={tf(it, h, anchor)} preserveAspectRatio="none" />
        {isSel(target) && !real ? frame(it, h, anchor) : null}
      </g>
    );
  };
  const selLabel = !selItem || !sel ? '' : sel.kind === 'pad' ? `Tầng lá ${padName(s.pads.indexOf(selItem))}` : lib.get(selItem.kind)?.label_vi ?? '';

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to={`/chon/${jobId}`} title="Tự thiết kế" />

      <div className="relative mx-gutter mt-3 overflow-hidden rounded-card border border-line bg-photo" style={{ aspectRatio: `${W} / ${H}` }}>
        <img src={data.photo_url} alt="Ảnh phôi của bạn" className="absolute inset-0 h-full w-full select-none" draggable={false} />
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className={cx('absolute inset-0 h-full w-full touch-none', peek && 'opacity-0')}
          onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerDown={() => setSel(null)} role="application"
          aria-label="Bản thiết kế: chạm cành để giữ hoặc cắt, kéo tầng lá, chậu và điểm ngọn">
          {s.pot && pot ? <g key="pot">{sprite(s.pot, { kind: 'pot' }, pot.soil_y ?? 0.2)}</g> : null}
          {s.accents.map((a) => <g key={a.id}>{sprite(a, { kind: 'accent', id: a.id })}</g>)}
          {!real ? data.branches.map((b, i) => {
            const [ex, ey] = branchEnd(b, trunkH);
            const cut = s.removed.includes(b.id);
            const mx = (b.start_px[0] + ex) / 2, my = (b.start_px[1] + ey) / 2;
            return (
              <g key={b.id} onPointerDown={(e) => { e.stopPropagation(); commit({ ...s, removed: cut ? s.removed.filter((x) => x !== b.id) : [...s.removed, b.id] }); }}
                className="cursor-pointer" role="button" aria-label={`Cành ${i + 1}: ${cut ? 'cắt' : 'giữ'}`}>
                <line x1={b.start_px[0]} y1={b.start_px[1]} x2={ex} y2={ey} stroke="transparent" strokeWidth={unit * 6} />
                <line x1={b.start_px[0]} y1={b.start_px[1]} x2={ex} y2={ey} stroke={cut ? 'var(--seal)' : 'var(--leaf)'} strokeWidth={unit * 0.9}
                  strokeDasharray={cut ? `${unit * 2} ${unit * 1.4}` : undefined} strokeLinecap="round" />
                {cut ? <path d={`M${mx - unit * 2},${my - unit * 2} L${mx + unit * 2},${my + unit * 2} M${mx + unit * 2},${my - unit * 2} L${mx - unit * 2},${my + unit * 2}`} stroke="var(--seal)" strokeWidth={unit * 0.9} /> : null}
                <circle cx={ex} cy={ey} r={unit * 2.6} fill={cut ? 'var(--seal)' : 'var(--leaf)'} />
                <text x={ex} y={ey} textAnchor="middle" dy="0.35em" fontSize={unit * 3} fontWeight={700} fill="var(--surface)" pointerEvents="none">{i + 1}</text>
              </g>
            );
          }) : null}
          {s.pads.map((p, i) => (
            <g key={p.id} aria-label={`Tầng lá ${padName(i)}`}>
              {sprite(p, { kind: 'pad', id: p.id })}
              {!real ? (
                <g pointerEvents="none">
                  <circle cx={p.x} cy={p.y} r={unit * 2.4} fill="var(--ink)" fillOpacity={0.55} />
                  <text x={p.x} y={p.y} textAnchor="middle" dy="0.35em" fontSize={unit * 2.8} fontWeight={700} fill="var(--surface)">{padName(i)}</text>
                </g>
              ) : null}
            </g>
          ))}
          {!real ? s.news.map((n) => {
            const v = { left: [-1, -0.3], right: [1, -0.3], up: [0, -1] }[n.dir];
            const len = trunkH * 0.13;
            const ex = n.x + v[0] * len, ey = n.y + v[1] * len;
            return (
              <g key={n.id} onPointerDown={(e) => startDrag(e, { kind: 'new', id: n.id }, [n.x, n.y])} className="cursor-grab" role="button" aria-label="Cành mới — kéo để đổi chỗ">
                <line x1={n.x} y1={n.y} x2={ex} y2={ey} stroke="transparent" strokeWidth={unit * 6} />
                <line x1={n.x} y1={n.y} x2={ex} y2={ey} stroke="var(--brass)" strokeWidth={unit * (isSel({ kind: 'new', id: n.id }) ? 1.4 : 1)} strokeLinecap="round" />
                <circle cx={ex} cy={ey} r={unit * 1.6} fill="var(--brass)" />
                <circle cx={n.x} cy={n.y} r={unit * 1.4} fill="var(--surface)" stroke="var(--brass)" strokeWidth={unit * 0.5} />
              </g>
            );
          }) : null}
          {!real ? (
            <g onPointerDown={(e) => startDrag(e, { kind: 'apex' }, s.apex)} className="cursor-grab" role="button" aria-label="Điểm ngọn — kéo để đổi">
              <circle cx={s.apex[0]} cy={s.apex[1]} r={unit * 5} fill="transparent" />
              <circle cx={s.apex[0]} cy={s.apex[1]} r={unit * 2} fill="var(--ink)" stroke="var(--surface)" strokeWidth={unit * 0.6} />
            </g>
          ) : null}
        </svg>
        <button type="button" aria-label="Giữ để xem ảnh gốc" onPointerDown={() => setPeek(true)} onPointerUp={() => setPeek(false)} onPointerLeave={() => setPeek(false)}
          className="absolute right-2 top-2 flex h-touch w-touch items-center justify-center rounded-full bg-surface text-ink shadow-card"><Eye size={18} aria-hidden="true" /></button>
      </div>
      <div className="mx-gutter mt-2">
        <Segmented<'edit' | 'real'> label="Chế độ xem" value={real ? 'real' : 'edit'} onChange={(v) => { setReal(v === 'real'); setSel(null); }}
          options={[['edit', 'Chỉnh sửa'], ['real', 'Xem như thật']]} />
      </div>

      {/* chỉnh chi tiết đang chọn */}
      <div className="mx-gutter mt-3 rounded-card border border-line bg-surface p-3 shadow-card">
        {selItem && sel ? (
          <div className="flex flex-col">
            <div className="mb-1 flex items-center justify-between gap-2 text-caption font-semibold">
              <span className="line-clamp-1">{selLabel}</span>
              <span className="flex flex-none">
                {sel.kind === 'pad' ? <button type="button" onClick={cycleShape} className="min-h-touch px-2 font-normal text-ink-muted">Đổi kiểu</button> : null}
                {sel.kind !== 'pot' ? (
                  <button type="button" onClick={() => patchSel({ flip: !selItem.flip }, true)} className="flex min-h-touch items-center gap-1 px-2 font-normal text-ink-muted">
                    <FlipHorizontal2 size={16} aria-hidden="true" />Lật
                  </button>
                ) : null}
                <button type="button" onClick={removeSel} className="flex min-h-touch items-center gap-1 px-2 font-normal text-danger"><Trash2 size={16} aria-hidden="true" />Xóa</button>
              </span>
            </div>
            <Slider label="To / nhỏ" value={selItem.w} min={Math.round(unit * 6)} max={Math.round(W * 0.95)} onChange={(v) => patchSel({ w: v })} />
            {sel.kind === 'pad' ? <Slider label="Nghiêng" value={selItem.rot} min={-40} max={40} onChange={(v) => patchSel({ rot: v })} /> : null}
          </div>
        ) : selNew ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-caption font-semibold">Cành mới
              <button type="button" onClick={removeSel} className="flex min-h-touch items-center gap-1 px-2 text-danger"><Trash2 size={16} aria-hidden="true" />Xóa</button>
            </div>
            <Segmented<'left' | 'right' | 'up'> label="Hướng cành" value={selNew.dir} options={[['left', 'Sang trái'], ['up', 'Lên trên'], ['right', 'Sang phải']]}
              onChange={(dir) => commit({ ...s, news: s.news.map((n) => (n.id === selNew.id ? { ...n, dir } : n)) })} />
          </div>
        ) : (
          <p className="m-0 text-caption text-ink-muted">Chạm cành để <b className="text-leaf">Giữ</b> / <b className="text-seal">Cắt</b>. Chọn chi tiết bên dưới rồi kéo tới chỗ muốn đặt.</p>
        )}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button variant="secondary" size="touch" className="whitespace-nowrap !px-2" onClick={addNew}><Sprout size={16} aria-hidden="true" />Cành mới</Button>
          <Button variant="ghost" size="touch" className="whitespace-nowrap !px-2" onClick={undo} disabled={!history.length}><Undo2 size={16} aria-hidden="true" />Hoàn tác</Button>
        </div>
      </div>

      {/* thư viện chi tiết cây */}
      <section className="mx-gutter mt-3 rounded-card border border-line bg-surface p-3 shadow-card" aria-label="Thư viện chi tiết cây">
        <Segmented<Tab> label="Nhóm chi tiết" value={tab} onChange={setTab} options={[['pad', 'Tầng lá'], ['apex', 'Ngọn'], ['pot', 'Chậu'], ['accent', 'Rêu, đá']]} />
        {tab === 'pad' || tab === 'apex' ? (
          <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Kiểu lá">
            {(Object.keys(LEAF_VI) as Leaf[]).map((l) => (
              <button key={l} type="button" aria-pressed={leaf === l} onClick={() => setLeaf(l)}
                className={cx('min-h-touch rounded-chip border px-3 text-label', leaf === l ? 'border-ink font-semibold text-ink' : 'border-line text-ink-muted')}>{LEAF_VI[l]}</button>
            ))}
          </div>
        ) : null}
        {shown.length ? (
          <div className="mt-2 grid grid-cols-3 gap-2">
            {shown.map((sp) => <Thumb key={sp.key} sprite={sp} onPick={() => add(sp)} active={sp.category === 'pot' && s.pot?.kind === sp.key} />)}
          </div>
        ) : <p className="m-0 mt-2 text-caption text-ink-muted">Chưa tải được thư viện.</p>}
      </section>

      {hints.length ? (
        <div className="mx-gutter mt-3"><Notice tone="info"><ul className="m-0 flex list-none flex-col gap-1 p-0">{hints.map((h) => <li key={h}>{h}</li>)}</ul></Notice></div>
      ) : null}

      <section className="mx-gutter mt-3 flex flex-col gap-3" aria-label="Mẫu và thế cây">
        {data.templates.length ? (
          <div>
            <div className="eyebrow mb-2 px-1">Bắt đầu lại từ mẫu</div>
            <div className="flex flex-wrap gap-2">
              {data.templates.map((t) => (
                <button key={t.rank} type="button" onClick={() => { commit(fromTemplate(data, t, leaf, lib)); setSel(null); }}
                  className="flex min-h-touch items-center gap-1 rounded-btn border border-line bg-surface px-3 text-caption font-medium hover:bg-surface-2">
                  <Plus size={14} aria-hidden="true" />{data.styles.find((x) => x.key === t.style_key)?.name_vi ?? t.style_key}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        <label className="flex flex-col gap-1 text-caption font-medium">Thế cây
          <select value={s.style_key} onChange={(e) => commit({ ...s, style_key: e.target.value })}
            className="min-h-touch rounded-btn border border-line-strong bg-surface px-3 text-body text-ink">
            {data.styles.map((x) => <option key={x.key} value={x.key}>{x.name_vi}{x.suggested ? ' · hợp phôi' : ''}</option>)}
          </select>
        </label>
      </section>

      {preview && preview.state !== 'none' ? (
        <section className="mx-gutter mt-4 rounded-card border border-line bg-surface p-3 shadow-card" aria-live="polite" aria-label="Xem thử nhanh">
          <div className="mb-2 flex items-center justify-between text-caption font-semibold">Xem thử nhanh<span className="rounded-chip bg-surface-2 px-2 py-0.5 text-label font-medium text-ink-muted">Minh họa</span></div>
          {preview.state === 'running' ? <Skeleton className="aspect-square w-full rounded-img" />
            : preview.url ? <img src={preview.url} alt="Ảnh xem thử nhanh theo thiết kế của bạn" className="w-full rounded-img border border-line" />
            : <Notice tone="warn">Chưa tạo được ảnh xem thử, thử lại sau (không tính lần).</Notice>}
          <p className="m-0 mt-2 text-label text-ink-subtle">{preview.state === 'running' ? 'Đang vẽ thử, khoảng 30 giây…' : 'Ảnh nháp. Ảnh đẹp khi “Tạo ảnh tương lai”.'}</p>
        </section>
      ) : null}
      {shared ? (
        <div className="mx-gutter mt-3"><Notice tone="success">Đã tạo link nhờ góp ý: <a href={shared} target="_blank" rel="noreferrer" className="break-all underline">{shared}</a></Notice></div>
      ) : null}

      <div className="sticky bottom-0 mt-6 flex flex-col gap-2 border-t border-line bg-surface px-gutter pb-6 pt-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button onClick={saveAndChoose} loading={busy === 'save'} loadingLabel="Đang lưu…" disabled={busy !== null}>Lưu thiết kế · {styleName}</Button>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="touch" className="whitespace-nowrap !px-2" onClick={quickPreview} loading={busy === 'preview'} loadingLabel="Đang gửi…"
            disabled={busy !== null || preview?.state === 'running' || preview?.remaining === 0}>
            <Sparkles size={16} aria-hidden="true" />Xem thử AI{preview ? ` · còn ${preview.remaining}` : ''}
          </Button>
          <Button variant="secondary" size="touch" className="whitespace-nowrap !px-2" onClick={askFriends} loading={busy === 'share'} loadingLabel="Đang tạo…" disabled={busy !== null}>
            <Share2 size={16} aria-hidden="true" />Nhờ góp ý
          </Button>
        </div>
        <span className="text-center text-label text-ink-subtle">Lưu, xem thử, nhờ góp ý miễn phí · tạo ảnh tương lai dùng 1 lượt</span>
      </div>
    </div>
  );
}
