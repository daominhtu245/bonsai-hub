/** Mô hình thiết kế của màn Tự thiết kế (tọa độ = pixel ảnh gốc) và chuyển đổi sang dữ liệu gửi server. */
import type { DesignInput, Sprite, StudioData, StudioTemplate } from '@/lib/studio';

export type Leaf = 'ficus' | 'fine' | 'needle' | 'strap';
export interface Item { id: string; kind: string; x: number; y: number; w: number; rot: number; flip: boolean } // x, y = tâm (chậu: tâm mặt đất)
export interface NewB { id: string; x: number; y: number; dir: 'left' | 'right' | 'up' }
export interface Design { style_key: string; removed: string[]; pads: Item[]; accents: Item[]; pot: Item | null; news: NewB[]; apex: [number, number] }

export const LEAF_OF: Record<string, Leaf> = { si: 'ficus', sanh: 'ficus', mai_chieu_thuy: 'fine', linh_sam: 'fine', tung_la_han: 'strap' };
export const LEAF_VI: Record<Leaf, string> = { ficus: 'Lá si, sanh', fine: 'Lá li ti', needle: 'Lá kim', strap: 'Lá dải' };
export const padName = (i: number) => String.fromCharCode(65 + i); // tầng lá A, B, C… (cành dùng số 1, 2, 3)
export const LIMIT = { pads: 12, accents: 6, news: 6 }; // trùng giới hạn của UserDesignIn (server)
let seq = 0;
export const uid = () => `x${++seq}`;

export function branchEnd(b: StudioData['branches'][number], trunkH: number): [number, number] {
  if (b.end_px) return b.end_px;
  const dir = { left: [-1, -0.3], right: [1, -0.3], up: [0, -1], back: [0.55, -0.55], front: [-0.55, -0.55] }[b.direction];
  const len = trunkH * ({ thick: 0.2, medium: 0.15, thin: 0.1 }[b.thickness]);
  const n = Math.hypot(dir[0], dir[1]);
  return [b.start_px[0] + (dir[0] / n) * len, b.start_px[1] + (dir[1] / n) * len];
}

/** Tầng lá theo khung tán của phương án AI: dưới rộng, lên dẹt và nhỏ dần, trên cùng là ngọn; so le trái phải. */
export function padsFromTemplate(d: StudioData, t: StudioTemplate, leaf: Leaf): Item[] {
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

export function defaultPot(d: StudioData, lib: Map<string, Sprite>, key = 'pot_oval_brown'): Item | null {
  if (!lib.has(key)) return null;
  const [bx, by] = d.trunk.base_point_px;
  return { id: 'pot', kind: key, x: bx, y: by, w: Math.max(d.trunk.base_diameter_px * 3, d.trunk.height_px * 0.75), rot: 0, flip: false };
}

export function fromTemplate(d: StudioData, t: StudioTemplate, leaf: Leaf, lib: Map<string, Sprite>): Design {
  const shape = t.pot?.shape;
  const potKey = shape === 'rectangle' ? 'pot_rect_brown' : shape === 'round' ? 'pot_round_blue' : shape === 'cascade_deep' ? 'pot_cascade' : 'pot_oval_brown';
  return { style_key: t.style_key, removed: t.removed, apex: t.apex ?? d.candidate_apex_px, pads: padsFromTemplate(d, t, leaf), accents: [], news: [], pot: defaultPot(d, lib, potKey) };
}

export function fromDraft(d: StudioData, x: DesignInput, leaf: Leaf, lib: Map<string, Sprite>): Design {
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

export function toInput(s: Design, d: StudioData, lib: Map<string, Sprite>): DesignInput {
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
export function liveHints(d: StudioData, s: Design, lib: Map<string, Sprite>): string[] {
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
