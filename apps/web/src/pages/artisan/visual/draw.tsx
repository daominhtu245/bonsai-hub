import type { ReactNode } from 'react';

/** Hình minh họa bộ luật (SVG 120×120, màu theo token — sáng / tối đều đúng). Đỏ = chỗ sai, xanh = cách đúng. */

export const C = { bark: 'var(--bark)', leaf: 'var(--leaf)', bad: 'var(--danger)', good: 'var(--primary)', line: 'var(--line-strong)', ink: 'var(--ink-muted)', pot: 'var(--clay)' };

export function Frame({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={label} className="h-full w-full">
      {children}
    </svg>
  );
}

/** Thân thon: bề rộng gốc w0, ngọn w1, theo các điểm từ gốc lên. */
export function Trunk({ pts, w0 = 12, w1 = 3, color = C.bark }: { pts: Array<[number, number]>; w0?: number; w1?: number; color?: string }) {
  const n = pts.length;
  const left: string[] = [];
  const right: string[] = [];
  pts.forEach(([x, y], i) => {
    const w = (w0 + (w1 - w0) * (i / (n - 1))) / 2;
    const [px, py] = pts[Math.min(i + 1, n - 1)];
    const [qx, qy] = pts[Math.max(i - 1, 0)];
    const dx = px - qx;
    const dy = py - qy;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    left.push(`${x + nx * w},${y + ny * w}`);
    right.unshift(`${x - nx * w},${y - ny * w}`);
  });
  return <polygon points={[...left, ...right].join(' ')} fill={color} />;
}

export const Br = ({ x1, y1, x2, y2, w = 3, color = C.bark }: { x1: number; y1: number; x2: number; y2: number; w?: number; color?: string }) => (
  <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={w} strokeLinecap="round" />
);
export const Pad = ({ cx, cy, rx = 14, ry = 6, color = C.leaf }: { cx: number; cy: number; rx?: number; ry?: number; color?: string }) => (
  <ellipse cx={cx} cy={cy} rx={rx} ry={ry} fill={color} opacity={0.85} />
);
export const Pot = ({ x = 30, w = 60, y = 108, h = 8, deep = false }: { x?: number; w?: number; y?: number; h?: number; deep?: boolean }) => (
  <path d={`M${x} ${y} h${w} l-${deep ? 6 : 4} ${deep ? h * 2 : h} h-${w - (deep ? 12 : 8)} z`} fill={C.pot} />
);
export const Mark = ({ cx, cy, r = 10 }: { cx: number; cy: number; r?: number }) => (
  <circle cx={cx} cy={cy} r={r} fill="none" stroke={C.bad} strokeWidth={2} strokeDasharray="3 2" />
);
const Straight = (p: { w0?: number; color?: string } = {}) => <Trunk pts={[[60, 108], [60, 70], [60, 22]]} w0={p.w0 ?? 12} w1={3} color={p.color} />;

/** Mã luật → hình. Mã chưa có hình thì thẻ chỉ hiện chữ. */
export const FAULT_ART: Record<string, ReactNode> = {
  bar_branches: (<><Pot /><Straight /><Br x1={60} y1={72} x2={26} y2={74} color={C.bad} /><Br x1={60} y1={72} x2={94} y2={74} color={C.bad} /><Pad cx={26} cy={70} /><Pad cx={94} cy={70} /><Pad cx={60} cy={28} rx={16} ry={9} /></>),
  eye_poke_branches: (<><Pot /><Straight /><circle cx={60} cy={66} r={7} fill={C.bad} /><circle cx={60} cy={66} r={12} fill="none" stroke={C.bad} strokeWidth={1.5} /><Br x1={60} y1={80} x2={30} y2={84} /><Pad cx={30} cy={80} /><Pad cx={60} cy={30} rx={16} ry={9} /></>),
  crossing_branches: (<><Pot /><Straight /><Br x1={60} y1={78} x2={92} y2={52} color={C.bad} /><Br x1={60} y1={58} x2={96} y2={78} color={C.bad} /><Pad cx={92} cy={48} /><Pad cx={96} cy={76} rx={11} /><Pad cx={60} cy={28} rx={16} ry={9} /></>),
  inside_of_curve_branches: (<><Pot /><Trunk pts={[[56, 108], [74, 86], [50, 60], [64, 26]]} /><Br x1={66} y1={80} x2={44} y2={86} color={C.bad} /><Pad cx={42} cy={82} /><Pad cx={64} cy={26} rx={16} ry={9} /><Mark cx={56} cy={82} r={12} /></>),
  whorled_or_wheel_spoke_branches: (<><Pot /><Straight />{[[24, 64], [42, 56], [80, 56], [96, 64], [60, 52]].map(([x, y]) => <Br key={x} x1={60} y1={70} x2={x} y2={y} color={C.bad} w={2.5} />)}<Pad cx={60} cy={28} rx={16} ry={9} /></>),
  parallel_branches: (<><Pot /><Straight /><Br x1={60} y1={80} x2={96} y2={74} color={C.bad} /><Br x1={60} y1={68} x2={96} y2={62} color={C.bad} /><Pad cx={96} cy={70} rx={10} /><Pad cx={96} cy={58} rx={10} /><Pad cx={60} cy={28} rx={16} ry={9} /></>),
  thin_branch_with_heavy_foliage: (<><Pot /><Straight /><Br x1={60} y1={70} x2={94} y2={66} w={1.2} color={C.bad} /><Pad cx={96} cy={60} rx={20} ry={12} /><Pad cx={60} cy={28} rx={14} ry={8} /></>),
  thick_branches_on_thin_trunk: (<><Pot /><Straight w0={6} /><Br x1={60} y1={74} x2={96} y2={70} w={7} color={C.bad} /><Pad cx={96} cy={66} /><Pad cx={60} cy={28} rx={14} ry={8} /></>),
  reverse_taper: (<><Pot /><Trunk pts={[[60, 108], [60, 70], [60, 34]]} w0={7} w1={16} color={C.bad} /><Pad cx={60} cy={28} rx={22} ry={10} /></>),
  crossing_roots: (<><Pot /><Straight /><Br x1={54} y1={106} x2={78} y2={110} color={C.bad} w={3} /><Br x1={66} y1={106} x2={42} y2={110} color={C.bad} w={3} /><Pad cx={60} cy={28} rx={16} ry={9} /></>),
  root_pointing_at_viewer: (<><Pot /><Straight /><ellipse cx={60} cy={110} rx={6} ry={4} fill={C.bad} /><circle cx={60} cy={110} r={9} fill="none" stroke={C.bad} strokeWidth={1.5} /><Pad cx={60} cy={28} rx={16} ry={9} /></>),
  no_c_shape_doubling_back: (<><Pot /><Trunk pts={[[60, 108], [84, 84], [86, 56], [62, 34], [42, 40]]} color={C.bad} w1={4} /><Pad cx={40} cy={36} rx={14} ry={8} /></>),
  no_bulge_toward_viewer: (<><Pot /><Trunk pts={[[52, 108], [76, 70], [56, 26]]} color={C.bad} /><path d="M94 60 l14 0 m-5 -4 l5 4 l-5 4" stroke={C.ink} strokeWidth={1.5} fill="none" /><text x={92} y={76} fontSize={8} fill={C.ink}>người xem</text><Pad cx={56} cy={24} rx={14} ry={8} /></>),
  avoid_too_many_s_curves_in_moyogi: (<><Pot /><Trunk pts={[[60, 108], [72, 96], [48, 84], [72, 72], [48, 60], [72, 48], [50, 36], [62, 24]]} color={C.bad} w1={4} /><Pad cx={62} cy={22} rx={14} ry={8} /></>),
  tighten_toward_apex: (<><Pot /><Trunk pts={[[56, 108], [80, 84], [48, 62], [66, 44], [56, 30], [62, 22]]} color={C.good} w1={3} /><Pad cx={62} cy={20} rx={14} ry={7} /></>),
  visible_wire_marks: (<><Pot /><Straight />{[96, 86, 76, 66, 56, 46].map((y) => <path key={y} d={`M53 ${y} l14 -6`} stroke={C.bad} strokeWidth={1.5} />)}<Pad cx={60} cy={28} rx={16} ry={9} /></>),
  fresh_large_scars_on_front: (<><Pot /><Straight w0={14} /><ellipse cx={60} cy={78} rx={4} ry={8} fill={C.bad} /><Pad cx={60} cy={28} rx={16} ry={9} /></>),
  unrelated_objects_in_pot: (<><Pot /><Straight /><rect x={74} y={98} width={8} height={10} fill={C.bad} /><path d="M72 98 l6 -6 l6 6 z" fill={C.bad} /><Pad cx={60} cy={28} rx={16} ry={9} /></>),
  // nguyên tắc (xanh = cách đúng)
  back_branch_never_lowest: (<><Pot /><Straight /><Br x1={60} y1={82} x2={26} y2={84} color={C.good} /><Br x1={60} y1={66} x2={94} y2={64} color={C.good} /><Br x1={60} y1={52} x2={74} y2={46} color={C.ink} w={2} /><text x={76} y={44} fontSize={8} fill={C.ink}>sau</text><Pad cx={26} cy={80} /><Pad cx={94} cy={60} rx={12} /><Pad cx={60} cy={28} rx={14} ry={8} /></>),
  from_outside_of_curves: (<><Pot /><Trunk pts={[[56, 108], [74, 86], [50, 60], [64, 26]]} /><Br x1={74} y1={84} x2={98} y2={80} color={C.good} /><Br x1={50} y1={62} x2={26} y2={58} color={C.good} /><Pad cx={98} cy={76} /><Pad cx={26} cy={54} /><Pad cx={64} cy={24} rx={14} ry={8} /></>),
  one_per_level: (<><Pot /><Straight /><Br x1={60} y1={84} x2={26} y2={86} color={C.good} /><Br x1={60} y1={70} x2={94} y2={68} color={C.good} /><Br x1={60} y1={56} x2={34} y2={54} color={C.good} w={2.5} /><Br x1={60} y1={44} x2={84} y2={42} color={C.good} w={2} /><Pad cx={26} cy={82} /><Pad cx={94} cy={64} rx={12} /><Pad cx={34} cy={50} rx={10} /><Pad cx={84} cy={38} rx={9} /><Pad cx={60} cy={24} rx={12} ry={7} /></>),
  continuous_to_apex: (<><Pot /><Straight /><Br x1={60} y1={80} x2={28} y2={82} /><Br x1={60} y1={64} x2={92} y2={62} /><Br x1={60} y1={48} x2={38} y2={46} w={2} /><Br x1={60} y1={36} x2={78} y2={34} w={1.5} /><Pad cx={28} cy={78} /><Pad cx={92} cy={58} rx={12} /><Pad cx={38} cy={42} rx={10} /><Pad cx={78} cy={30} rx={8} /><Pad cx={60} cy={22} rx={10} ry={6} color={C.good} /></>),
  lower_trunk_visible_from_front: (<><Pot /><Straight /><rect x={48} y={74} width={24} height={34} fill="none" stroke={C.good} strokeWidth={1.5} strokeDasharray="3 2" /><Br x1={60} y1={70} x2={26} y2={72} /><Br x1={60} y1={58} x2={94} y2={56} /><Pad cx={26} cy={68} /><Pad cx={94} cy={52} rx={12} /><Pad cx={60} cy={28} rx={14} ry={8} /></>),
  single: (<><Pot /><Straight /><Br x1={60} y1={74} x2={28} y2={76} /><Br x1={60} y1={60} x2={92} y2={58} /><Pad cx={28} cy={72} /><Pad cx={92} cy={54} rx={12} /><Pad cx={60} cy={24} rx={12} ry={8} color={C.good} /></>),
  negative_space: (<><Pot /><Straight /><Br x1={60} y1={80} x2={28} y2={82} /><Br x1={60} y1={60} x2={92} y2={58} /><Pad cx={28} cy={78} rx={16} ry={6} /><Pad cx={92} cy={54} rx={14} ry={6} /><Pad cx={60} cy={28} rx={16} ry={8} /><circle cx={78} cy={76} r={8} fill="none" stroke={C.good} strokeWidth={1.5} strokeDasharray="3 2" /><circle cx={40} cy={50} r={8} fill="none" stroke={C.good} strokeWidth={1.5} strokeDasharray="3 2" /></>),
  scalene_triangle: (<><Pot /><Straight /><Br x1={60} y1={80} x2={24} y2={82} /><Br x1={60} y1={60} x2={88} y2={58} /><Pad cx={24} cy={78} rx={16} ry={6} /><Pad cx={88} cy={54} rx={12} ry={6} /><Pad cx={60} cy={26} rx={12} ry={7} /><path d="M60 16 L12 82 L100 60 Z" fill="none" stroke={C.good} strokeWidth={1.5} strokeDasharray="4 3" /></>),
};

/** Sơ đồ thế (nhìn mặt tiền): góc thân `angle` (độ, nghiêng sang phải). */
export function StyleSketch({ style, angle }: { style: string; angle?: number }) {
  const a = ((Math.min(90, Math.max(0, angle ?? 0))) * Math.PI) / 180;
  const bx = 60 - Math.sin(a) * 34; // nghiêng nhiều thì dời gốc sang trái cho thân nằm trong khung
  const len = 80 - Math.sin(a) * 14;
  const top: [number, number] = [bx + Math.sin(a) * len, 108 - Math.cos(a) * len];
  const art: Record<string, ReactNode> = {
    chokkan: (<><Pot /><Straight /><Br x1={60} y1={80} x2={30} y2={82} /><Br x1={60} y1={64} x2={90} y2={62} /><Pad cx={30} cy={78} /><Pad cx={90} cy={58} rx={12} /><Pad cx={60} cy={28} rx={14} ry={8} /></>),
    moyogi: (<><Pot /><Trunk pts={[[56, 108], [76, 86], [50, 62], [66, 40], [60, 24]]} /><Br x1={76} y1={84} x2={98} y2={80} /><Br x1={50} y1={62} x2={26} y2={58} /><Pad cx={98} cy={76} rx={12} /><Pad cx={26} cy={54} /><Pad cx={60} cy={22} rx={14} ry={8} /></>),
    shakan: (<><Pot /><Trunk pts={[[bx, 108], [(bx + top[0]) / 2, (108 + top[1]) / 2], top]} /><Br x1={(bx + top[0]) / 2} y1={(108 + top[1]) / 2} x2={(bx + top[0]) / 2 - 22} y2={(108 + top[1]) / 2 - 10} /><Pad cx={(bx + top[0]) / 2 - 22} cy={(108 + top[1]) / 2 - 14} /><Pad cx={top[0]} cy={top[1] - 2} rx={16} ry={8} /></>),
    kengai: (<><Pot x={22} w={34} y={46} h={20} deep /><Trunk pts={[[38, 46], [60, 40], [84, 66], [92, 104]]} w0={10} /><Pad cx={92} cy={106} rx={14} ry={7} /><Pad cx={74} cy={52} rx={10} ry={5} /><Pad cx={36} cy={36} rx={10} ry={5} /></>),
    han_kengai: (<><Pot x={24} w={40} y={70} h={14} deep /><Trunk pts={[[42, 70], [62, 60], [88, 72], [100, 80]]} w0={10} /><Pad cx={100} cy={78} rx={14} ry={6} /><Pad cx={42} cy={56} rx={12} ry={6} /></>),
    bunjingi: (<><Pot x={44} w={32} /><Trunk pts={[[60, 108], [52, 80], [66, 54], [56, 30], [70, 20]]} w0={6} w1={2} /><Pad cx={72} cy={18} rx={16} ry={6} /><Pad cx={52} cy={30} rx={8} ry={4} /></>),
    fukinagashi: (<><Pot /><Trunk pts={[[46, 108], [64, 70], [86, 40]]} /><Br x1={64} y1={70} x2={100} y2={70} w={2} /><Br x1={76} y1={54} x2={108} y2={50} w={2} /><Pad cx={100} cy={68} rx={12} ry={5} /><Pad cx={106} cy={48} rx={12} ry={5} /><Pad cx={92} cy={36} rx={14} ry={6} /></>),
    sokan: (<><Pot /><Trunk pts={[[56, 108], [54, 60], [54, 22]]} /><Trunk pts={[[64, 108], [70, 80], [76, 56]]} w0={8} /><Pad cx={56} cy={22} rx={18} ry={8} /><Pad cx={80} cy={52} rx={12} ry={6} /></>),
    sekijoju: (<><Pot /><path d="M38 108 Q42 72 60 70 Q80 72 84 108 Z" fill={C.line} /><Trunk pts={[[60, 70], [60, 44], [60, 24]]} w0={10} /><Br x1={56} y1={74} x2={44} y2={106} w={3} /><Br x1={64} y1={74} x2={78} y2={106} w={3} /><Pad cx={60} cy={26} rx={20} ry={9} /></>),
    hokidachi: (<><Pot /><Trunk pts={[[60, 108], [60, 70]]} w0={12} w1={8} />{[[40, 40], [52, 34], [68, 34], [80, 40]].map(([x, y]) => <Br key={x} x1={60} y1={70} x2={x} y2={y} w={3} />)}<ellipse cx={60} cy={38} rx={30} ry={20} fill={C.leaf} opacity={0.8} /></>),
  };
  return <Frame label={`Sơ đồ thế ${style}`}>{art[style] ?? art.chokkan}</Frame>;
}

/** Dáng chậu (nhìn ngang). */
export function PotShape({ shape }: { shape: string }) {
  const s = shape.toLowerCase();
  const deep = s.includes('deep');
  const round = s.includes('round') || s.includes('oval');
  const small = s.includes('small') || s.includes('shallow');
  const w = small ? 50 : 80;
  const h = deep ? 34 : small ? 10 : 16;
  const x = 60 - w / 2;
  const y = 70;
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={`Chậu ${shape}`} className="h-full w-full">
      {round
        ? <path d={`M${x} ${y} h${w} q-4 ${h} -${w * 0.2} ${h} h-${w * 0.6} q-${w * 0.2} 0 -${w * 0.2} -${h} z`} fill={C.pot} />
        : <path d={`M${x} ${y} h${w} l-5 ${h} h-${w - 10} z`} fill={C.pot} />}
      <rect x={x - 2} y={y - 3} width={w + 4} height={4} rx={2} fill={C.pot} />
    </svg>
  );
}
