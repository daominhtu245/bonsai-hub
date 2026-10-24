import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Eye, Leaf, Plus, Sprout, Trash2, Undo2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { BackHeader } from '@/components/BackHeader';
import { Button, Notice, Segmented, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { studioApi, type DesignInput, type PotColor, type PotPosition, type PotShape, type StudioData, type StudioTemplate } from '@/lib/studio';

// ---------- mô hình trên màn hình (tọa độ = pixel ảnh gốc) ----------
interface PadS { id: string; cx: number; cy: number; rx: number; ry: number; rot: number }
interface NewB { id: string; x: number; y: number; dir: 'left' | 'right' | 'up' }
interface Design {
  style_key: string;
  removed: string[];
  pads: PadS[];
  news: NewB[];
  apex: [number, number];
  pot: { shape: PotShape; color: PotColor; position: PotPosition };
}
type Sel = { kind: 'pad' | 'new'; id: string } | { kind: 'apex' } | null;

const padName = (i: number) => String.fromCharCode(65 + i); // A, B, C… (cành dùng số 1, 2, 3)
const POT_COLOR: Record<PotColor, string> = { unglazed_brown: 'var(--clay)', glazed_blue: 'var(--chart-3)', glazed_cream: 'var(--surface-2)' };
let seq = 0;
const uid = () => `x${++seq}`;

function branchEnd(b: StudioData['branches'][number], trunkH: number): [number, number] {
  if (b.end_px) return b.end_px;
  const dir = { left: [-1, -0.3], right: [1, -0.3], up: [0, -1], back: [0.55, -0.55], front: [-0.55, -0.55] }[b.direction];
  const len = trunkH * ({ thick: 0.2, medium: 0.15, thin: 0.1 }[b.thickness]);
  const n = Math.hypot(dir[0], dir[1]);
  return [b.start_px[0] + (dir[0] / n) * len, b.start_px[1] + (dir[1] / n) * len];
}

/** Tầng lá hình đám mây (viền gợn) — nhìn giống tán lá hơn hình elip trơn. */
function cloudPath(p: PadS): string {
  const n = 36;
  const r = (p.rot * Math.PI) / 180;
  const pts = Array.from({ length: n }, (_, i) => {
    const t = (2 * Math.PI * i) / n;
    const k = 1 + 0.07 * Math.sin(7 * t) + 0.04 * Math.sin(11 * t + 1);
    const x = p.rx * k * Math.cos(t), y = p.ry * k * Math.sin(t);
    return [p.cx + x * Math.cos(r) - y * Math.sin(r), p.cy + x * Math.sin(r) + y * Math.cos(r)];
  });
  return `M${pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')} Z`;
}

/** Tầng lá theo khung tán của phương án AI: dưới to, lên nhỏ dần, so le trái phải. */
function padsFromTemplate(d: StudioData, t: StudioTemplate): PadS[] {
  const [ax, ay] = t.apex ?? d.candidate_apex_px;
  const sw = t.silhouette?.width_px ?? d.trunk.height_px * 0.9;
  const sh = t.silhouette?.height_px ?? d.trunk.height_px * 0.75;
  const n = Math.max(2, Math.min(7, t.pads || 4));
  // Tầng thấp nhất từ khoảng 1/3 chiều cao thân trở lên (không sát gốc), tầng trên cùng ngay dưới ngọn.
  const [, by] = d.trunk.base_point_px;
  const bottom = Math.min(ay + sh * 0.85, by - d.trunk.height_px * 0.3);
  const top = ay + sh * 0.08;
  return Array.from({ length: n }, (_, i) => {
    const f = i / (n - 1); // 0 = dưới cùng
    const side = i === n - 1 ? 0 : i % 2 === 0 ? -1 : 1;
    const rx = sw * (0.3 - 0.17 * f);
    return { id: uid(), cx: ax + side * sw * 0.2 * (1 - f), cy: bottom + (top - bottom) * f, rx, ry: rx * 0.4, rot: side * -6 };
  });
}

function fromDraft(d: StudioData, x: DesignInput): Design {
  return {
    style_key: x.style_key, removed: x.removed, apex: x.apex ?? d.candidate_apex_px, pot: x.pot,
    pads: x.pads.map((p) => ({ id: uid(), cx: p.center_px[0], cy: p.center_px[1], rx: p.rx, ry: p.ry, rot: p.rotation })),
    news: x.new_branches.map((n) => ({ id: uid(), x: n.at_px[0], y: n.at_px[1], dir: n.direction })),
  };
}

function fromTemplate(d: StudioData, t: StudioTemplate): Design {
  return {
    style_key: t.style_key, removed: t.removed, apex: t.apex ?? d.candidate_apex_px, pads: padsFromTemplate(d, t), news: [],
    pot: { shape: t.pot?.shape ?? 'oval', color: 'unglazed_brown', position: t.pot?.position ?? 'center' },
  };
}

/** Gợi ý tức thời (chỉ tham khảo, cùng tinh thần bonsai_pipeline/user_design.py). */
function liveHints(d: StudioData, s: Design): string[] {
  const out: string[] = [];
  const num = new Map(d.branches.map((b, i) => [b.id, i + 1]));
  if (!s.pads.length) out.push('Chưa có tầng lá — bấm “Thêm tầng lá”.');
  const kept = d.branches.filter((b) => !s.removed.includes(b.id) && (b.direction === 'left' || b.direction === 'right'));
  kept.forEach((a, i) => kept.slice(i + 1).forEach((b) => {
    if (a.direction !== b.direction && Math.abs(a.height_ratio - b.height_ratio) < 0.04) out.push(`Cành ${num.get(a.id)} và ${num.get(b.id)} mọc ngang nhau hai bên — thường nên cắt bớt một cành.`);
  }));
  s.pads.forEach((a, i) => s.pads.slice(i + 1).forEach((b, j) => {
    if (Math.abs(a.cx - b.cx) < (a.rx + b.rx) * 0.7 && Math.abs(a.cy - b.cy) < (a.ry + b.ry) * 0.6) out.push(`Tầng lá ${padName(i)} và ${padName(i + j + 1)} chồng lên nhau — nên chừa khoảng trống.`);
  }));
  if (s.pads.length && s.apex[1] > Math.min(...s.pads.map((p) => p.cy - p.ry)) + 2) out.push('Ngọn đang thấp hơn tầng lá trên cùng.');
  return [...new Set(out)].slice(0, 4);
}

function toInput(s: Design): DesignInput {
  return {
    style_key: s.style_key, removed: s.removed, apex: s.apex, pot: s.pot,
    pads: s.pads.map((p) => ({ center_px: [Math.round(p.cx), Math.round(p.cy)], rx: Math.round(p.rx), ry: Math.round(p.ry), rotation: Math.round(p.rot) })),
    new_branches: s.news.map((n) => ({ at_px: [Math.round(n.x), Math.round(n.y)], direction: n.dir })),
  };
}

function Slider({ label, value, min, max, step = 1, onChange }: { label: string; value: number; min: number; max: number; step?: number; onChange: (v: number) => void }) {
  return (
    <label className="flex min-h-touch items-center gap-3 text-caption">
      <span className="w-[5.5rem] flex-none whitespace-nowrap text-ink-muted">{label}</span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-[var(--primary)]" />
    </label>
  );
}

/** Tự thiết kế: người dùng tự ghép dáng trên ảnh phôi (cành giữ / cắt, tầng lá, cành mới, ngọn, chậu). */
export default function Studio() {
  const { jobId = '' } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<StudioData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [s, setS] = useState<Design | null>(null);
  const [history, setHistory] = useState<Design[]>([]);
  const [sel, setSel] = useState<Sel>(null);
  const [peek, setPeek] = useState(false);
  const [saving, setSaving] = useState(false);
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<{ dx: number; dy: number; moved: boolean } | null>(null);

  useEffect(() => {
    studioApi.get(jobId).then((d) => {
      setData(d);
      setS(d.draft ? fromDraft(d, d.draft) : d.templates[0] ? fromTemplate(d, d.templates[0])
        : { style_key: d.styles[0]?.key ?? 'moyogi', removed: [], pads: [], news: [], apex: d.candidate_apex_px, pot: { shape: 'oval', color: 'unglazed_brown', position: 'center' } });
    }).catch((e: ApiError) => setError(e.message));
  }, [jobId]);

  const hints = useMemo(() => (data && s ? liveHints(data, s) : []), [data, s]);
  if (error) return <div className="mx-auto max-w-content"><BackHeader to={`/chon/${jobId}`} title="Tự thiết kế" /><div className="p-gutter"><Notice tone="danger">{error}</Notice></div></div>;
  if (!data || !s) return <div className="mx-auto max-w-content"><BackHeader to={`/chon/${jobId}`} title="Tự thiết kế" /><div className="p-gutter"><Skeleton className="aspect-[3/4] w-full rounded-card" /></div></div>;

  const W = data.width, H = data.height;
  const unit = Math.min(W, H) / 100; // 1% cạnh ngắn
  const trunkH = data.trunk.height_px;
  const [bx, by] = data.trunk.base_point_px;
  const commit = (next: Design) => { setHistory((h) => [...h.slice(-30), s]); setS(next); };
  const undo = () => { const prev = history[history.length - 1]; if (prev) { setS(prev); setHistory(history.slice(0, -1)); setSel(null); } };

  const toImage = (e: { clientX: number; clientY: number }): [number, number] => {
    const el = svg.current;
    const m = el?.getScreenCTM?.();
    if (!el || !m) return [0, 0];
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
    else if (sel.kind === 'pad') setS({ ...s, pads: s.pads.map((p) => (p.id === sel.id ? { ...p, cx: nx, cy: ny } : p)) });
    else setS({ ...s, news: s.news.map((n) => (n.id === sel.id ? { ...n, x: nx, y: ny, dir: n.dir === 'up' ? 'up' : nx < bx ? 'left' : 'right' } : n)) });
  };
  const endDrag = () => {
    if (drag.current && !drag.current.moved) setHistory((h) => h.slice(0, -1)); // chỉ chạm chọn: không tính là thay đổi
    drag.current = null;
  };

  const toggleBranch = (id: string) => commit({ ...s, removed: s.removed.includes(id) ? s.removed.filter((x) => x !== id) : [...s.removed, id] });
  const addPad = () => {
    const top = s.pads.length ? Math.min(...s.pads.map((p) => p.cy)) : by - trunkH * 0.35;
    const rx = Math.max(unit * 6, (s.pads.length ? Math.min(...s.pads.map((p) => p.rx)) * 0.85 : trunkH * 0.28));
    const pad = { id: uid(), cx: s.apex[0], cy: Math.max(rx * 0.4, top - rx * 0.9), rx, ry: rx * 0.4, rot: 0 };
    commit({ ...s, pads: [...s.pads, pad] });
    setSel({ kind: 'pad', id: pad.id });
  };
  const addNew = () => {
    const n: NewB = { id: uid(), x: bx - data.trunk.base_diameter_px * 0.4, y: by - trunkH * 0.4, dir: 'left' };
    commit({ ...s, news: [...s.news, n] });
    setSel({ kind: 'new', id: n.id });
  };
  const selPad = sel?.kind === 'pad' ? s.pads.find((p) => p.id === sel.id) : undefined;
  const selNew = sel?.kind === 'new' ? s.news.find((n) => n.id === sel.id) : undefined;
  const updPad = (patch: Partial<PadS>) => selPad && setS({ ...s, pads: s.pads.map((p) => (p.id === selPad.id ? { ...p, ...patch } : p)) });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await studioApi.save(jobId, toInput(s));
      navigate(`/chon/${jobId}?option=${r.option_id}`);
    } catch (e) {
      setError((e as ApiError).message);
      setSaving(false);
    }
  };

  // chậu (xem trước): dưới gốc, rộng theo tán
  const spread = s.pads.length ? Math.max(...s.pads.map((p) => Math.abs(p.cx - bx) + p.rx)) : trunkH * 0.4;
  const potW = Math.max(data.trunk.base_diameter_px * 2.4, spread * 1.1);
  const potH = s.pot.shape === 'cascade_deep' ? potW * 0.75 : s.pot.shape === 'round' ? potW * 0.4 : potW * 0.22;
  const potCx = bx + (s.pot.position === 'off_center_left' ? potW * 0.15 : s.pot.position === 'off_center_right' ? -potW * 0.15 : 0);
  const potPath = s.pot.shape === 'oval' || s.pot.shape === 'round'
    ? `M${potCx - potW / 2},${by} H${potCx + potW / 2} A${potW / 2},${potH} 0 0 1 ${potCx - potW / 2},${by} Z`
    : `M${potCx - potW / 2},${by} H${potCx + potW / 2} L${potCx + potW * 0.42},${by + potH} H${potCx - potW * 0.42} Z`;
  const styleName = data.styles.find((x) => x.key === s.style_key)?.name_vi ?? s.style_key;

  return (
    <div className="mx-auto flex min-h-dvh max-w-content flex-col">
      <BackHeader to={`/chon/${jobId}`} title="Tự thiết kế" />

      <div className="relative mx-gutter mt-3 overflow-hidden rounded-card border border-line bg-photo" style={{ aspectRatio: `${W} / ${H}` }}>
        <img src={data.photo_url} alt="Ảnh phôi của bạn" className="absolute inset-0 h-full w-full select-none" draggable={false} />
        <svg ref={svg} viewBox={`0 0 ${W} ${H}`} className={cx('absolute inset-0 h-full w-full touch-none', peek && 'opacity-0')}
          onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag} onPointerDown={() => setSel(null)} role="application"
          aria-label="Bản thiết kế: chạm cành để giữ hoặc cắt, kéo tầng lá và điểm ngọn">
          <path d={potPath} fill={POT_COLOR[s.pot.color]} fillOpacity={0.85} stroke="var(--bark)" strokeWidth={unit * 0.4} />
          {s.pads.map((p, i) => (
            <g key={p.id} onPointerDown={(e) => startDrag(e, { kind: 'pad', id: p.id }, [p.cx, p.cy])} className="cursor-grab">
              <path d={cloudPath(p)} fill="var(--leaf)" fillOpacity={0.5} stroke={sel?.kind === 'pad' && sel.id === p.id ? 'var(--ink)' : 'var(--leaf)'}
                strokeWidth={unit * (sel?.kind === 'pad' && sel.id === p.id ? 0.7 : 0.4)} />
              <text x={p.cx} y={p.cy} textAnchor="middle" dy="0.35em" fontSize={unit * 3.2} fontWeight={600} fill="var(--surface)" pointerEvents="none">{padName(i)}</text>
            </g>
          ))}
          {data.branches.map((b, i) => {
            const [ex, ey] = branchEnd(b, trunkH);
            const cut = s.removed.includes(b.id);
            const mx = (b.start_px[0] + ex) / 2, my = (b.start_px[1] + ey) / 2;
            return (
              <g key={b.id} onPointerDown={(e) => { e.stopPropagation(); toggleBranch(b.id); }} className="cursor-pointer" role="button"
                aria-label={`Cành ${i + 1}: ${cut ? 'cắt' : 'giữ'}`}>
                <line x1={b.start_px[0]} y1={b.start_px[1]} x2={ex} y2={ey} stroke="transparent" strokeWidth={unit * 6} />
                <line x1={b.start_px[0]} y1={b.start_px[1]} x2={ex} y2={ey} stroke={cut ? 'var(--seal)' : 'var(--leaf)'} strokeWidth={unit * 1}
                  strokeDasharray={cut ? `${unit * 2} ${unit * 1.4}` : undefined} strokeLinecap="round" />
                {cut ? <path d={`M${mx - unit * 2},${my - unit * 2} L${mx + unit * 2},${my + unit * 2} M${mx + unit * 2},${my - unit * 2} L${mx - unit * 2},${my + unit * 2}`} stroke="var(--seal)" strokeWidth={unit * 0.9} /> : null}
                <circle cx={ex} cy={ey} r={unit * 2.6} fill={cut ? 'var(--seal)' : 'var(--leaf)'} />
                <text x={ex} y={ey} textAnchor="middle" dy="0.35em" fontSize={unit * 3} fontWeight={700} fill="var(--surface)" pointerEvents="none">{i + 1}</text>
              </g>
            );
          })}
          {s.news.map((n) => {
            const d = { left: [-1, -0.3], right: [1, -0.3], up: [0, -1] }[n.dir];
            const len = trunkH * 0.13;
            const ex = n.x + d[0] * len, ey = n.y + d[1] * len;
            return (
              <g key={n.id} onPointerDown={(e) => startDrag(e, { kind: 'new', id: n.id }, [n.x, n.y])} className="cursor-grab">
                <line x1={n.x} y1={n.y} x2={ex} y2={ey} stroke="transparent" strokeWidth={unit * 6} />
                <line x1={n.x} y1={n.y} x2={ex} y2={ey} stroke="var(--brass)" strokeWidth={unit * (sel?.kind === 'new' && sel.id === n.id ? 1.4 : 1)} strokeLinecap="round" />
                <circle cx={ex} cy={ey} r={unit * 1.6} fill="var(--brass)" />
                <circle cx={n.x} cy={n.y} r={unit * 1.4} fill="var(--surface)" stroke="var(--brass)" strokeWidth={unit * 0.5} />
              </g>
            );
          })}
          <g onPointerDown={(e) => startDrag(e, { kind: 'apex' }, s.apex)} className="cursor-grab" role="button" aria-label="Điểm ngọn — kéo để đổi">
            <circle cx={s.apex[0]} cy={s.apex[1]} r={unit * 5} fill="transparent" />
            <circle cx={s.apex[0]} cy={s.apex[1]} r={unit * 2} fill="var(--ink)" stroke="var(--surface)" strokeWidth={unit * 0.6} />
          </g>
        </svg>
        <button type="button" aria-label="Giữ để xem ảnh gốc" onPointerDown={() => setPeek(true)} onPointerUp={() => setPeek(false)} onPointerLeave={() => setPeek(false)}
          className="absolute right-2 top-2 flex h-touch w-touch items-center justify-center rounded-full bg-surface text-ink shadow-card">
          <Eye size={18} aria-hidden="true" />
        </button>
      </div>

      {/* công cụ cho đối tượng đang chọn */}
      <div className="mx-gutter mt-3 rounded-card border border-line bg-surface p-3 shadow-card">
        {selPad ? (
          <div className="flex flex-col">
            <div className="mb-1 flex items-center justify-between text-caption font-semibold">Tầng lá {padName(s.pads.indexOf(selPad))}
              <button type="button" onClick={() => { commit({ ...s, pads: s.pads.filter((p) => p.id !== selPad.id) }); setSel(null); }}
                className="flex min-h-touch items-center gap-1 px-2 text-danger"><Trash2 size={16} aria-hidden="true" />Xóa</button>
            </div>
            <Slider label="To / nhỏ" value={selPad.rx} min={unit * 4} max={W * 0.45} onChange={(v) => updPad({ rx: v, ry: v * (selPad.ry / selPad.rx) })} />
            <Slider label="Dày / mỏng" value={Math.round((selPad.ry / selPad.rx) * 100)} min={20} max={80} onChange={(v) => updPad({ ry: (selPad.rx * v) / 100 })} />
            <Slider label="Nghiêng" value={selPad.rot} min={-40} max={40} onChange={(v) => updPad({ rot: v })} />
          </div>
        ) : selNew ? (
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-caption font-semibold">Cành mới
              <button type="button" onClick={() => { commit({ ...s, news: s.news.filter((n) => n.id !== selNew.id) }); setSel(null); }}
                className="flex min-h-touch items-center gap-1 px-2 text-danger"><Trash2 size={16} aria-hidden="true" />Xóa</button>
            </div>
            <Segmented<'left' | 'right' | 'up'> label="Hướng cành" value={selNew.dir} options={[['left', 'Sang trái'], ['up', 'Lên trên'], ['right', 'Sang phải']]}
              onChange={(dir) => commit({ ...s, news: s.news.map((n) => (n.id === selNew.id ? { ...n, dir } : n)) })} />
          </div>
        ) : (
          <p className="m-0 text-caption text-ink-muted">Chạm vào cành để <b className="text-leaf">Giữ</b> / <b className="text-seal">Cắt</b>. Kéo tầng lá, cành mới và điểm ngọn tới chỗ bạn muốn.</p>
        )}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Button variant="secondary" size="touch" className="whitespace-nowrap !px-2" onClick={addPad}><Leaf size={16} aria-hidden="true" />Tầng lá</Button>
          <Button variant="secondary" size="touch" className="whitespace-nowrap !px-2" onClick={addNew}><Sprout size={16} aria-hidden="true" />Cành mới</Button>
          <Button variant="ghost" size="touch" className="whitespace-nowrap !px-2" onClick={undo} disabled={!history.length}><Undo2 size={16} aria-hidden="true" />Hoàn tác</Button>
        </div>
      </div>

      {hints.length ? (
        <div className="mx-gutter mt-3"><Notice tone="info"><ul className="m-0 flex list-none flex-col gap-1 p-0">{hints.map((h) => <li key={h}>{h}</li>)}</ul></Notice></div>
      ) : null}

      <section className="mx-gutter mt-4 flex flex-col gap-3" aria-label="Thế và chậu">
        {data.templates.length ? (
          <div>
            <div className="eyebrow mb-2 px-1">Bắt đầu lại từ mẫu</div>
            <div className="flex flex-wrap gap-2">
              {data.templates.map((t) => (
                <button key={t.rank} type="button" onClick={() => { commit(fromTemplate(data, t)); setSel(null); }}
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
        <div className="flex flex-col gap-2">
          <span className="text-caption font-medium">Chậu</span>
          <Segmented<PotShape> label="Dáng chậu" value={s.pot.shape} onChange={(shape) => commit({ ...s, pot: { ...s.pot, shape } })}
            options={[['rectangle', 'Chữ nhật'], ['oval', 'Bầu dục'], ['round', 'Tròn'], ['cascade_deep', 'Sâu']]} />
          <Segmented<PotColor> label="Màu chậu" value={s.pot.color} onChange={(color) => commit({ ...s, pot: { ...s.pot, color } })}
            options={[['unglazed_brown', 'Nâu mộc'], ['glazed_blue', 'Men xanh'], ['glazed_cream', 'Men kem']]} />
          <Segmented<PotPosition> label="Vị trí cây trong chậu" value={s.pot.position} onChange={(position) => commit({ ...s, pot: { ...s.pot, position } })}
            options={[['off_center_left', 'Lệch trái'], ['center', 'Giữa'], ['off_center_right', 'Lệch phải']]} />
        </div>
      </section>

      <div className="sticky bottom-0 mt-6 flex flex-col gap-2 border-t border-line bg-surface px-gutter pb-6 pt-4">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Button onClick={save} loading={saving} loadingLabel="Đang lưu…">Lưu thiết kế · {styleName}</Button>
        <span className="text-center text-label text-ink-subtle">Lưu miễn phí · tạo ảnh tương lai dùng 1 lượt</span>
      </div>
    </div>
  );
}
