import { useState, type ReactNode } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import { cx } from '@/lib/cx';
import { keyLabel, termLabel } from '@/lib/ruleLabels';
import { C, FAULT_ART, Frame, PotShape, StyleSketch } from './draw';

/** Bộ luật trực quan: hình minh họa cập nhật ngay khi chỉnh số; lỗi cấm / nguyên tắc là thẻ có hình, bật / tắt một chạm.
 *  Cùng dữ liệu với form đầy đủ (RuleEditor) — chỉ là cách nhìn khác, lưu / phiên bản dùng chung. */

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };
type Doc = Record<string, Json>;
type Path = Array<string | number>;
type Props = { value: Doc; base: Doc; onChange: (v: Doc) => void; readOnly?: boolean };

const get = (root: Json, path: Path): Json | undefined => path.reduce<Json | undefined>((o, k) => (o == null ? undefined : (o as Record<string, Json>)[k as string]), root);
function setIn(root: Json, path: Path, value: Json | undefined): Json {
  if (!path.length) return value as Json;
  const [k, ...rest] = path;
  if (Array.isArray(root)) {
    const c = [...root];
    c[k as number] = setIn(c[k as number], rest, value);
    return c;
  }
  const o = { ...((root ?? {}) as Record<string, Json>) };
  if (value === undefined && !rest.length) delete o[k as string];
  else o[k as string] = setIn(o[k as string], rest, value);
  return o;
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString('vi-VN', { maximumFractionDigits: 2 }));

function Changed({ on }: { on: boolean }) {
  return on ? <span className="rounded-chip bg-warn-soft px-1.5 text-label font-medium text-warn-ink">đã sửa</span> : null;
}

function Stepper({ value, step, min = 0, max = 1000, onChange, readOnly, label }: { value: number; step: number; min?: number; max?: number; onChange: (v: number) => void; readOnly?: boolean; label: string }) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  return (
    <span className="inline-flex items-center rounded-btn border border-line-strong bg-surface">
      <button type="button" aria-label={`Giảm ${label}`} disabled={readOnly} onClick={() => onChange(clamp(value - step))} className="flex h-[40px] w-[36px] items-center justify-center text-ink-muted disabled:opacity-40"><Minus size={14} /></button>
      <input aria-label={label} inputMode="decimal" disabled={readOnly} value={fmt(value)}
        onChange={(e) => { const n = Number(e.target.value.replace(',', '.')); if (Number.isFinite(n) && e.target.value.trim()) onChange(n); }}
        className="tabular h-[40px] w-[56px] bg-transparent text-center text-caption font-semibold text-ink" />
      <button type="button" aria-label={`Tăng ${label}`} disabled={readOnly} onClick={() => onChange(clamp(value + step))} className="flex h-[40px] w-[36px] items-center justify-center text-ink-muted disabled:opacity-40"><Plus size={14} /></button>
    </span>
  );
}

// ---------- 1. Tỉ lệ ----------

type PropKey = 'height_to_base_diameter' | 'first_branch_height_ratio' | 'pot_length_to_tree_height' | 'pot_depth_to_base_diameter' | 'branch_to_trunk_caliper_max';
const PROPS: Array<{ k: PropKey; title: string; hint: string; step: number; max: number }> = [
  { k: 'height_to_base_diameter', title: 'Chiều cao so với đường kính gốc', hint: 'Cây cao gấp bao nhiêu lần bề ngang gốc. Số nhỏ = thân mập, lùn.', step: 0.5, max: 20 },
  { k: 'first_branch_height_ratio', title: 'Độ cao cành đầu tiên', hint: 'Cành thấp nhất mọc ở khoảng nào của chiều cao cây (0,33 = một phần ba).', step: 0.05, max: 0.9 },
  { k: 'pot_length_to_tree_height', title: 'Chiều dài chậu', hint: 'Dài chậu so với chiều cao cây.', step: 0.05, max: 2 },
  { k: 'pot_depth_to_base_diameter', title: 'Độ sâu chậu', hint: 'Sâu chậu so với đường kính gốc (thế huyền dùng chậu sâu riêng).', step: 0.1, max: 4 },
  { k: 'branch_to_trunk_caliper_max', title: 'Cành to tối đa', hint: 'Cành không to hơn phần này của thân tại chỗ mọc.', step: 0.05, max: 1 },
];
const mid = (v: Json | undefined, d: number) => (Array.isArray(v) ? ((v[0] as number) + (v[1] as number)) / 2 : typeof v === 'number' ? v : d);

function ProportionDiagram({ p, focus }: { p: Record<string, Json>; focus: PropKey | null }) {
  const G = 280; // mặt chậu
  const H = 220;
  const ratio = mid(p.height_to_base_diameter, 6);
  const D = H / ratio;
  const fb = p.first_branch_height_ratio as number[] | undefined;
  const fbLo = G - H * (fb?.[0] ?? 0.25);
  const fbHi = G - H * (fb?.[1] ?? 0.4);
  const fbY = (fbLo + fbHi) / 2;
  const pl = mid(p.pot_length_to_tree_height, 0.67) * H;
  const pd = Math.max(8, mid(p.pot_depth_to_base_diameter, 1) * D);
  const wAt = (y: number) => D + (6 - D) * ((G - y) / H);
  const cal = (typeof p.branch_to_trunk_caliper_max === 'number' ? p.branch_to_trunk_caliper_max : 0.33) * wAt(fbY);
  const hi = (k: PropKey) => (focus === k ? C.good : 'var(--ink-subtle)');
  const sw = (k: PropKey) => (focus === k ? 2.5 : 1);
  const x0 = 150;
  return (
    <svg viewBox="0 0 300 440" role="img" aria-label="Sơ đồ tỉ lệ cây mẫu" className="w-full max-w-[360px]">
      {/* dải cho phép của cành đầu */}
      <rect x={20} y={fbHi} width={260} height={fbLo - fbHi} fill={focus === 'first_branch_height_ratio' ? 'var(--primary-soft)' : 'var(--surface-2)'} />
      {/* chậu */}
      <path d={`M${x0 - pl / 2} ${G} h${pl} l-8 ${pd} h-${pl - 16} z`} fill={C.pot} />
      {/* thân thon */}
      <polygon points={`${x0 - D / 2},${G} ${x0 + D / 2},${G} ${x0 + 3},${G - H} ${x0 - 3},${G - H}`} fill={C.bark} />
      {/* rễ loe */}
      <path d={`M${x0 - D / 2 - 10} ${G} Q${x0 - D / 2} ${G - 6} ${x0 - D / 2 + 2} ${G - 14} L${x0 + D / 2 - 2} ${G - 14} Q${x0 + D / 2} ${G - 6} ${x0 + D / 2 + 10} ${G} Z`} fill={C.bark} />
      {/* cành đầu + tầng lá */}
      <line x1={x0} y1={fbY} x2={x0 - 90} y2={fbY + 4} stroke={focus === 'branch_to_trunk_caliper_max' ? C.good : C.bark} strokeWidth={Math.max(2, cal)} strokeLinecap="round" />
      <ellipse cx={x0 - 88} cy={fbY - 2} rx={32} ry={10} fill={C.leaf} opacity={0.85} />
      <line x1={x0} y1={fbY - 50} x2={x0 + 70} y2={fbY - 54} stroke={C.bark} strokeWidth={Math.max(1.5, cal * 0.7)} strokeLinecap="round" />
      <ellipse cx={x0 + 70} cy={fbY - 58} rx={26} ry={9} fill={C.leaf} opacity={0.85} />
      <ellipse cx={x0 + 4} cy={G - H + 6} rx={30} ry={14} fill={C.leaf} opacity={0.85} />
      {/* kích thước: cao */}
      <g stroke={hi('height_to_base_diameter')} strokeWidth={sw('height_to_base_diameter')} fill={hi('height_to_base_diameter')}>
        <line x1={270} y1={G} x2={270} y2={G - H} /><line x1={264} y1={G} x2={276} y2={G} /><line x1={264} y1={G - H} x2={276} y2={G - H} />
        <line x1={x0 - D / 2} y1={G + pd + 18} x2={x0 + D / 2} y2={G + pd + 18} />
        <text x={290} y={G - H - 10} fontSize={11} stroke="none" textAnchor="end">cao = {fmt(ratio)} × gốc</text>
        <text x={x0} y={G + pd + 30} fontSize={10} stroke="none" textAnchor="middle">gốc</text>
      </g>
      {/* kích thước: cành đầu */}
      <g stroke={hi('first_branch_height_ratio')} strokeWidth={sw('first_branch_height_ratio')} fill={hi('first_branch_height_ratio')}>
        <line x1={28} y1={G} x2={28} y2={fbY} /><line x1={22} y1={fbY} x2={34} y2={fbY} />
        <text x={34} y={fbLo + 14} fontSize={10} stroke="none">cành đầu</text>
        <text x={34} y={fbLo + 26} fontSize={10} stroke="none">{fmt(fb?.[0] ?? 0)}–{fmt(fb?.[1] ?? 0)} × cao</text>
      </g>
      {/* kích thước: chậu */}
      <g stroke={hi('pot_length_to_tree_height')} strokeWidth={sw('pot_length_to_tree_height')} fill={hi('pot_length_to_tree_height')}>
        <line x1={x0 - pl / 2} y1={G + pd + 44} x2={x0 + pl / 2} y2={G + pd + 44} />
        <text x={x0} y={G + pd + 60} fontSize={11} stroke="none" textAnchor="middle">dài chậu = {fmt(mid(p.pot_length_to_tree_height, 0))} × cao</text>
      </g>
      <g stroke={hi('pot_depth_to_base_diameter')} strokeWidth={sw('pot_depth_to_base_diameter')} fill={hi('pot_depth_to_base_diameter')}>
        <line x1={x0 + pl / 2 + 8} y1={G} x2={x0 + pl / 2 + 8} y2={G + pd} />
        <text x={x0 + pl / 2 + 12} y={G + pd / 2 + 4} fontSize={10} stroke="none">sâu</text>
      </g>
    </svg>
  );
}

function Proportions({ value, base, onChange, readOnly }: Props) {
  const [focus, setFocus] = useState<PropKey | null>(null);
  const p = (value.proportions ?? {}) as Record<string, Json>;
  const set = (k: string, v: Json) => onChange(setIn(value, ['proportions', k], v) as Doc);
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr]">
      <div className="flex justify-center rounded-card bg-surface-2 p-3 lg:sticky lg:top-[76px] lg:self-start"><ProportionDiagram p={p} focus={focus} /></div>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {PROPS.map(({ k, title, hint, step, max }) => {
          const v = p[k];
          return (
            <li key={k} onMouseEnter={() => setFocus(k)} onFocus={() => setFocus(k)} onMouseLeave={() => setFocus(null)}
              className={cx('flex flex-col gap-2 rounded-card border bg-surface p-3', focus === k ? 'border-primary' : 'border-line')}>
              <div className="flex items-center gap-2">
                <span className="text-caption font-semibold">{title}</span>
                <Changed on={!same(v, get(base, ['proportions', k]))} />
              </div>
              <span className="text-label text-ink-muted">{hint}</span>
              {Array.isArray(v) ? (
                <span className="flex flex-wrap items-center gap-2 text-caption">
                  từ <Stepper label={`${title} từ`} value={v[0] as number} step={step} max={max} readOnly={readOnly} onChange={(n) => set(k, [n, Math.max(n, v[1] as number)])} />
                  đến <Stepper label={`${title} đến`} value={v[1] as number} step={step} max={max} readOnly={readOnly} onChange={(n) => set(k, [Math.min(n, v[0] as number), n])} />
                </span>
              ) : typeof v === 'number' ? (
                <Stepper label={title} value={v} step={step} max={max} readOnly={readOnly} onChange={(n) => set(k, n)} />
              ) : <span className="text-ink-subtle">—</span>}
            </li>
          );
        })}
        {(['next_branch_spacing', 'nebari_visible_above_soil'] as const).map((k) => (typeof p[k] === 'string' ? (
          <li key={k} className="rounded-card border border-line bg-surface p-3 text-caption">
            <span className="font-semibold">{keyLabel(k)}:</span> {termLabel(p[k] as string)}
          </li>
        ) : null))}
      </ul>
    </div>
  );
}

// ---------- 2. Lỗi cấm & nguyên tắc (thẻ có hình) ----------

const WHY: Record<string, string> = {
  bar_branches: 'Hai cành mọc đối nhau cùng độ cao, như thanh ngang chặn mắt.',
  eye_poke_branches: 'Cành đâm thẳng ra phía người xem, nhìn mặt tiền thấy cụt.',
  crossing_branches: 'Cành bắt chéo nhau hoặc chéo qua thân, rối mắt.',
  inside_of_curve_branches: 'Cành mọc ở phía bụng (bên trong) khúc uốn.',
  whorled_or_wheel_spoke_branches: 'Nhiều cành tỏa ra từ cùng một điểm như nan bánh xe.',
  parallel_branches: 'Hai cành chồng nhau cùng hướng, song song.',
  thin_branch_with_heavy_foliage: 'Cành mảnh mà ôm tán lá nặng, mất cân đối.',
  thick_branches_on_thin_trunk: 'Cành to ngang thân, thân trông yếu.',
  reverse_taper: 'Thân to dần lên trên thay vì thon dần.',
  crossing_roots: 'Rễ nổi bắt chéo nhau quanh gốc.',
  root_pointing_at_viewer: 'Rễ chĩa thẳng ra phía người xem.',
  no_c_shape_doubling_back: 'Thân cong gập ngược kiểu chữ C.',
  no_bulge_toward_viewer: 'Thân ưỡn bụng về phía người xem (nhìn ngang).',
  avoid_too_many_s_curves_in_moyogi: 'Trực uốn có quá nhiều khúc, như lò xo.',
  tighten_toward_apex: 'Khúc uốn nhỏ dần, ngắn dần khi lên ngọn.',
  visible_wire_marks: 'Vết dây uốn hằn trên vỏ.',
  fresh_large_scars_on_front: 'Vết cắt lớn còn mới ở mặt tiền.',
  unrelated_objects_in_pot: 'Tượng, đồ trang trí không liên quan trong chậu.',
  back_branch_never_lowest: 'Cành phía sau không bao giờ là cành thấp nhất.',
  first_two_forward_of_midline: 'Hai cành đầu hơi nhích ra phía trước đường giữa thân.',
  from_outside_of_curves: 'Cành mọc ở lưng (bên ngoài) khúc uốn.',
  continuous_to_apex: 'Cành phân bố liên tục từ khoảng 1/3 thân lên tới ngọn.',
  one_per_level: 'Mỗi độ cao chỉ một cành, so le trái – phải – sau.',
  lower_trunk_visible_from_front: 'Nửa dưới thân để lộ, không cành che phía trước.',
  single: 'Cây chỉ có một ngọn rõ ràng.',
  continues_trunk_flow: 'Ngọn tiếp đúng hướng chuyển động của thân.',
};
// danh sách mã được bật / tắt — đường dẫn trong rule_set
const LISTS: Array<{ path: Path; title: string; codes: string[]; good?: boolean }> = [
  { path: ['branches', 'forbidden'], title: 'Cành cấm', codes: ['bar_branches', 'eye_poke_branches', 'crossing_branches', 'inside_of_curve_branches', 'whorled_or_wheel_spoke_branches', 'parallel_branches', 'thin_branch_with_heavy_foliage', 'thick_branches_on_thin_trunk', 'reverse_taper'] },
  { path: ['roots', 'forbidden'], title: 'Rễ cấm', codes: ['crossing_roots', 'root_pointing_at_viewer'] },
  { path: ['trunk', 'curves'], title: 'Khúc uốn của thân', codes: ['tighten_toward_apex', 'no_c_shape_doubling_back', 'no_bulge_toward_viewer', 'avoid_too_many_s_curves_in_moyogi'] },
  { path: ['display_faults'], title: 'Lỗi khi trưng bày', codes: ['visible_wire_marks', 'fresh_large_scars_on_front', 'unrelated_objects_in_pot'] },
];
const BOOLS: Array<{ path: Path; code: string }> = [
  { path: ['branches', 'back_branch_never_lowest'], code: 'back_branch_never_lowest' },
  { path: ['branches', 'first_two_forward_of_midline'], code: 'first_two_forward_of_midline' },
  { path: ['branches', 'from_outside_of_curves'], code: 'from_outside_of_curves' },
  { path: ['branches', 'continuous_to_apex'], code: 'continuous_to_apex' },
  { path: ['branches', 'one_per_level'], code: 'one_per_level' },
  { path: ['trunk', 'lower_trunk_visible_from_front'], code: 'lower_trunk_visible_from_front' },
  { path: ['apex', 'single'], code: 'single' },
  { path: ['apex', 'continues_trunk_flow'], code: 'continues_trunk_flow' },
];

function RuleCard({ code, on, changed, bad, onToggle, readOnly, title }: { code: string; on: boolean; changed: boolean; bad: boolean; onToggle: () => void; readOnly?: boolean; title?: string }) {
  const art = FAULT_ART[code];
  return (
    <li className={cx('flex flex-col overflow-hidden rounded-card border bg-surface', on ? 'border-line' : 'border-dashed border-line opacity-60')}>
      <div className="relative aspect-square bg-surface-2 p-2">
        {art ? <Frame label={termLabel(code)}>{art}</Frame> : <span className="flex h-full items-center justify-center text-label text-ink-subtle">chưa có hình</span>}
        <span className={cx('absolute left-2 top-2 rounded-chip px-1.5 text-label font-semibold', bad ? 'bg-danger-soft text-danger' : 'bg-primary-soft text-primary-ink')}>{bad ? 'Sai' : 'Đúng'}</span>
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2.5">
        <span className="flex items-center gap-1.5 text-caption font-semibold">{title ?? termLabel(code)}<Changed on={changed} /></span>
        <span className="text-label text-ink-muted">{WHY[code] ?? ''}</span>
        <label className="mt-auto flex min-h-touch cursor-pointer items-center gap-2 pt-1 text-label font-medium">
          <input type="checkbox" role="switch" className="switch" checked={on} disabled={readOnly} onChange={onToggle} aria-label={`Áp dụng: ${title ?? termLabel(code)}`} />
          {on ? 'Đang áp dụng' : 'Không áp dụng'}
        </label>
      </div>
    </li>
  );
}

function Faults({ value, base, onChange, readOnly }: Props) {
  return (
    <div className="flex flex-col gap-5">
      {LISTS.map(({ path, title, codes }) => {
        const list = (get(value, path) as string[] | undefined) ?? [];
        const baseList = (get(base, path) as string[] | undefined) ?? [];
        const all = [...codes, ...list.filter((c) => !codes.includes(c))];
        return (
          <section key={path.join('.')}>
            <h3 className="m-0 mb-2 text-caption font-semibold">{title} <span className="font-normal text-ink-subtle">· {list.length}/{all.length} đang áp dụng</span></h3>
            <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 xl:grid-cols-5">
              {all.map((code) => (
                <RuleCard key={code} code={code} on={list.includes(code)} changed={list.includes(code) !== baseList.includes(code)} bad={code !== 'tighten_toward_apex'} readOnly={readOnly}
                  onToggle={() => onChange(setIn(value, path, list.includes(code) ? list.filter((c) => c !== code) : [...list, code]) as Doc)} />
              ))}
            </ul>
          </section>
        );
      })}
      <section>
        <h3 className="m-0 mb-2 text-caption font-semibold">Nguyên tắc nên theo</h3>
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3 xl:grid-cols-5">
          {BOOLS.filter(({ path }) => typeof get(value, path) === 'boolean').map(({ path, code }) => (
            <RuleCard key={code} code={code} title={keyLabel(code)} bad={false} on={get(value, path) === true} changed={get(value, path) !== get(base, path)} readOnly={readOnly}
              onToggle={() => onChange(setIn(value, path, !get(value, path)) as Doc)} />
          ))}
        </ul>
      </section>
    </div>
  );
}

// ---------- 3. Thứ tự cành (nhìn từ trên) + dáng tán ----------

function BranchOrder({ value, base, onChange, readOnly }: Props) {
  const angle = (get(value, ['branches', 'spread_angle_deg']) as number) ?? 120;
  const order = (get(value, ['branches', 'order']) as string[]) ?? [];
  const r = 70;
  const at = (deg: number) => [100 + r * Math.cos((deg * Math.PI) / 180), 100 + r * Math.sin((deg * Math.PI) / 180)];
  const dirs = [270 - angle, 270 + angle, 270]; // 0° = phải, 90° = về phía người xem; cành 3 thẳng ra sau
  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr] md:items-center">
      <svg viewBox="0 0 200 220" role="img" aria-label="Sơ đồ cành nhìn từ trên xuống" className="w-full max-w-[240px]">
        <circle cx={100} cy={100} r={r} fill="none" stroke={C.line} strokeDasharray="3 3" />
        {dirs.map((d, i) => {
          const [x, y] = at(d);
          return (
            <g key={i}>
              <line x1={100} y1={100} x2={x} y2={y} stroke={i === 2 ? C.ink : C.good} strokeWidth={4} strokeLinecap="round" />
              <circle cx={x} cy={y} r={11} fill="var(--surface)" stroke={i === 2 ? C.ink : C.good} strokeWidth={2} />
              <text x={x} y={y + 4} fontSize={11} textAnchor="middle" fill="var(--ink)">{i + 1}</text>
            </g>
          );
        })}
        <circle cx={100} cy={100} r={10} fill={C.bark} />
        <text x={100} y={212} fontSize={11} textAnchor="middle" fill={C.ink}>▲ người xem (mặt tiền)</text>
      </svg>
      <div className="flex flex-col gap-3 text-caption">
        <span className="flex items-center gap-2 font-semibold">Góc tỏa giữa 3 cành đầu <Changed on={angle !== get(base, ['branches', 'spread_angle_deg'])} /></span>
        <Stepper label="Góc tỏa (độ)" value={angle} step={10} min={60} max={180} readOnly={readOnly} onChange={(n) => onChange(setIn(value, ['branches', 'spread_angle_deg'], n) as Doc)} />
        <ol className="m-0 flex flex-col gap-1 pl-5">{order.map((o) => <li key={o}>{termLabel(o)}</li>)}</ol>
      </div>
    </div>
  );
}

// ---------- 4. Thế cây (ảnh thật + sơ đồ + thông số + chậu) ----------

export const STYLE_PHOTO: Record<string, string> = {
  chokkan: 'chokkan', moyogi: 'moyogi', shakan: 'shakan', kengai: 'kengai', han_kengai: 'han_kengai', bunjingi: 'bunjingi',
  fukinagashi: 'fukinagashi', sekijoju: 'sekijoju', sokan: 'kabudachi', vn_truc_quan_tu: 'chokkan',
};
const POT_SHAPES = ['rectangle', 'oval_or_round', 'rectangle_or_oval', 'deep_round_or_hexagonal', 'medium_deep_round', 'small_round_shallow', 'deep_rectangle'];

function Photo({ style }: { style: string }) {
  const f = STYLE_PHOTO[style];
  if (!f) return <div className="aspect-[4/3] rounded-btn bg-surface-2" />;
  return (
    <figure className="m-0">
      <img src={`/images/styles/${f}.webp`} alt={`Ví dụ thế ${keyLabel(style)}`} loading="lazy" className="aspect-[4/3] w-full rounded-btn bg-photo object-cover" />
      <figcaption className="mt-0.5 text-[10px] text-ink-subtle">Ảnh ví dụ · Wikimedia Commons</figcaption>
    </figure>
  );
}

function NumField({ label, v, path, value, base, onChange, readOnly, step }: { label: string; v: Json; path: Path; step: number } & Props) {
  const changed = !same(v, get(base, path));
  return (
    <div className="flex flex-wrap items-center gap-2 text-label">
      <span className="min-w-[120px] text-ink-muted">{label}</span>
      {Array.isArray(v) ? (
        <>
          <Stepper label={`${label} từ`} value={v[0] as number} step={step} readOnly={readOnly} onChange={(n) => onChange(setIn(value, [...path, 0], n) as Doc)} />
          <Stepper label={`${label} đến`} value={v[1] as number} step={step} readOnly={readOnly} onChange={(n) => onChange(setIn(value, [...path, 1], n) as Doc)} />
        </>
      ) : <Stepper label={label} value={v as number} step={step} readOnly={readOnly} onChange={(n) => onChange(setIn(value, path, n) as Doc)} />}
      <Changed on={changed} />
    </div>
  );
}

function Styles(props: Props) {
  const { value, base, onChange, readOnly } = props;
  const specs = (value.style_specifics ?? {}) as Record<string, Record<string, Json>>;
  const pots = (get(value, ['pot', 'shape_by_style']) ?? {}) as Record<string, string>;
  const keys = [...new Set([...Object.keys(specs), ...Object.keys(pots)])];
  return (
    <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 2xl:grid-cols-3">
      {keys.map((k) => {
        const s = specs[k] ?? {};
        const ang = s.trunk_angle_deg;
        return (
          <li key={k} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3">
            <div className="flex items-baseline gap-2"><span className="text-body font-semibold">{keyLabel(k)}</span><span className="font-mono text-[11px] text-ink-subtle">{k}</span></div>
            <div className="grid grid-cols-[1fr_96px] gap-2">
              <Photo style={k} />
              <div className="flex flex-col gap-1 rounded-btn bg-surface-2 p-1">
                <StyleSketch style={k} angle={Array.isArray(ang) ? ((ang[0] as number) + (ang[1] as number)) / 2 : (ang as number | undefined)} />
                <span className="text-center text-[10px] text-ink-subtle">sơ đồ</span>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              {Object.entries(s).map(([f, v]) => (typeof v === 'number' || (Array.isArray(v) && v.every((x) => typeof x === 'number')) ? (
                <NumField key={f} {...props} label={keyLabel(f)} v={v} path={['style_specifics', k, f]} step={f.includes('angle') ? 5 : 0.05} />
              ) : (
                <div key={f} className="text-label"><span className="text-ink-muted">{keyLabel(f)}:</span> {typeof v === 'string' ? termLabel(v) : JSON.stringify(v)}</div>
              )))}
            </div>
            {k in pots || STYLE_PHOTO[k] ? (
              <div className="flex items-center gap-2 border-t border-line pt-2">
                <span className="h-12 w-12 flex-none"><PotShape shape={pots[k] ?? 'rectangle'} /></span>
                <label className="flex flex-1 flex-col gap-0.5 text-label text-ink-muted">Chậu hợp thế
                  <select value={pots[k] ?? ''} disabled={readOnly} onChange={(e) => onChange(setIn(value, ['pot', 'shape_by_style', k], e.target.value || undefined) as Doc)}
                    className="min-h-[40px] rounded-btn border border-line-strong bg-surface px-2 text-caption text-ink">
                    <option value="">—</option>
                    {POT_SHAPES.map((p) => <option key={p} value={p}>{termLabel(p)}</option>)}
                  </select>
                </label>
                <Changed on={pots[k] !== get(base, ['pot', 'shape_by_style', k])} />
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

// ---------- 5. Thời gian lớn ----------

function Growth({ value, base, onChange, readOnly }: Props) {
  const g = (value.growth ?? {}) as Record<string, Record<string, number>>;
  const rows: Array<[string, string, number, string]> = [['years_to_final', 'Số năm tới dáng hoàn chỉnh (ảnh S4)', 1, 'năm'], ['max_thicken_pct_per_year', 'Thân dày thêm tối đa mỗi năm', 1, '%']];
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {rows.map(([k, title, step, unit]) => (
        <div key={k} className="rounded-card border border-line bg-surface p-3">
          <div className="mb-2 text-caption font-semibold">{title}</div>
          {(['slow', 'medium', 'fast'] as const).map((sp) => {
            const v = g[k]?.[sp];
            if (typeof v !== 'number') return null;
            const maxV = Math.max(...Object.values(g[k] ?? {}), 1);
            return (
              <div key={sp} className="grid grid-cols-[80px_1fr_auto] items-center gap-2 py-1 text-label">
                <span className="text-ink-muted">Loài lớn {keyLabel(sp).toLowerCase()}</span>
                <span className="h-2.5 rounded-full bg-surface-2"><span className="block h-full rounded-full bg-primary" style={{ width: `${(v / maxV) * 100}%` }} /></span>
                <span className="flex items-center gap-1">
                  <Stepper label={`${title} — ${keyLabel(sp)}`} value={v} step={step} readOnly={readOnly} onChange={(n) => onChange(setIn(value, ['growth', k, sp], n) as Doc)} />
                  {unit}<Changed on={v !== get(base, ['growth', k, sp])} />
                </span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ---------- khung ----------

type Sec = 'proportions' | 'faults' | 'branches' | 'styles' | 'growth';
const SECTIONS: Array<[Sec, string, string]> = [
  ['proportions', 'Tỉ lệ', 'Rê chuột / chạm vào một mục để thấy kích thước đó trên hình.'],
  ['faults', 'Lỗi cấm & nguyên tắc', 'Mỗi thẻ là một luật; tắt = AI không còn coi đó là lỗi.'],
  ['branches', 'Thứ tự cành', 'Nhìn từ trên xuống: cành 1, 2 hai bên, cành 3 phía sau.'],
  ['styles', 'Thế cây & chậu', 'Ảnh ví dụ, sơ đồ dáng, thông số riêng và chậu hợp từng thế.'],
  ['growth', 'Thời gian lớn', 'Dùng để vẽ ảnh từng giai đoạn và tính độ dày thân.'],
];

export function RuleSetVisual(props: Props) {
  const [sec, setSec] = useState<Sec>('proportions');
  const body: Record<Sec, ReactNode> = {
    proportions: <Proportions {...props} />, faults: <Faults {...props} />, branches: <BranchOrder {...props} />, styles: <Styles {...props} />, growth: <Growth {...props} />,
  };
  const cur = SECTIONS.find(([k]) => k === sec)!;
  return (
    <div className="flex flex-col gap-3">
      <div role="tablist" aria-label="Phần bộ luật" className="flex flex-wrap gap-2">
        {SECTIONS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={sec === k} onClick={() => setSec(k)}
            className={cx('min-h-touch rounded-full border px-4 text-caption font-medium', sec === k ? 'border-ink bg-ink text-bg' : 'border-line bg-surface text-ink-muted hover:text-ink')}>
            {label}
          </button>
        ))}
      </div>
      <p className="m-0 text-label text-ink-muted">{cur[2]}</p>
      {body[sec]}
    </div>
  );
}

// ---------- Dáng & thế Việt ----------

const DANG_ANGLE: Record<string, number> = { truc: 0, xieu: 40, hoanh: 80, huyen: 0 };

export function StylesVnVisual({ value, base, onChange, readOnly }: Props) {
  const dang = (value.dang ?? {}) as Record<string, Record<string, Json>>;
  const the = (value.the ?? {}) as Record<string, Record<string, Json>>;
  const sketchFor = (d: string) => (d === 'huyen' ? 'kengai' : d === 'xieu' || d === 'hoanh' ? 'shakan' : 'chokkan');
  return (
    <div className="flex flex-col gap-5">
      <section>
        <h3 className="m-0 mb-2 text-caption font-semibold">Dáng (góc thân so với phương thẳng đứng)</h3>
        <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 md:grid-cols-4">
          {Object.entries(dang).map(([k, d]) => {
            const a = d.angle_deg;
            const shown = Array.isArray(a) ? ((a[0] as number) + (a[1] as number)) / 2 : typeof a === 'number' ? a : DANG_ANGLE[k];
            return (
              <li key={k} className="flex flex-col gap-1.5 rounded-card border border-line bg-surface p-2.5">
                <div className="aspect-square rounded-btn bg-surface-2"><StyleSketch style={sketchFor(k)} angle={k === 'huyen' ? undefined : shown} /></div>
                <span className="text-caption font-semibold">{String(d.name_vi ?? keyLabel(k))}</span>
                {Array.isArray(a) ? (
                  <span className="flex flex-wrap items-center gap-1 text-label">
                    <Stepper label={`Góc ${k} từ`} value={a[0] as number} step={5} max={180} readOnly={readOnly} onChange={(n) => onChange(setIn(value, ['dang', k, 'angle_deg', 0], n) as Doc)} />
                    <Stepper label={`Góc ${k} đến`} value={a[1] as number} step={5} max={180} readOnly={readOnly} onChange={(n) => onChange(setIn(value, ['dang', k, 'angle_deg', 1], n) as Doc)} />°
                  </span>
                ) : <span className="text-label text-ink-muted">Góc: {String(a)}°</span>}
                <Changed on={!same(a, get(base, ['dang', k, 'angle_deg']))} />
                {d.meaning ? <span className="text-label text-ink-muted">{String(d.meaning)}</span> : null}
              </li>
            );
          })}
        </ul>
      </section>
      <section>
        <h3 className="m-0 mb-2 text-caption font-semibold">Thế ({Object.keys(the).length})</h3>
        <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2 2xl:grid-cols-3">
          {Object.entries(the).map(([k, t]) => {
            const mapped = ((t.maps_to as string[] | undefined) ?? []).find((m) => STYLE_PHOTO[m]);
            const nums = (t.numbers ?? {}) as Record<string, Json>;
            return (
              <li key={k} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-body font-semibold">{String(t.name_vi ?? k)}</span>
                  <span className="rounded-chip bg-surface-2 px-2 text-label">{keyLabel(String(t.dang ?? ''))}</span>
                  {t.trunks ? <span className="text-label text-ink-muted">{Array.isArray(t.trunks) ? (t.trunks as number[]).join(' hoặc ') : String(t.trunks)} thân</span> : null}
                </div>
                <div className="grid grid-cols-[1fr_88px] gap-2">
                  {mapped ? <Photo style={mapped} /> : <div className="flex aspect-[4/3] items-center justify-center rounded-btn bg-surface-2 text-label text-ink-subtle">chưa có ảnh ví dụ</div>}
                  <div className="rounded-btn bg-surface-2 p-1"><StyleSketch style={Number(Array.isArray(t.trunks) ? t.trunks[0] : t.trunks) === 2 ? 'sokan' : sketchFor(String(t.dang))} angle={DANG_ANGLE[String(t.dang)]} /></div>
                </div>
                <label className="flex flex-col gap-1 text-label text-ink-muted">Bố cục
                  <textarea value={String(t.structure ?? '')} disabled={readOnly} rows={2} onChange={(e) => onChange(setIn(value, ['the', k, 'structure'], e.target.value) as Doc)}
                    className="rounded-btn border border-line-strong bg-surface p-2 text-caption text-ink" />
                </label>
                {Object.entries(nums).map(([f, v]) => (typeof v === 'number' || Array.isArray(v) ? (
                  <NumField key={f} value={value} base={base} onChange={onChange} readOnly={readOnly} label={keyLabel(f === 'branches' ? 'branches_n' : f)} v={v} path={['the', k, 'numbers', f]} step={Number.isInteger(Array.isArray(v) ? v[0] : v) ? 1 : 0.05} />
                ) : null))}
                {t.meaning ? <span className="text-label"><span className="text-ink-muted">Ý nghĩa:</span> {String(t.meaning)}</span> : null}
                {!same(t, get(base, ['the', k])) ? <Changed on /> : null}
              </li>
            );
          })}
        </ul>
      </section>
      <p className="m-0 flex items-center gap-1 text-label text-ink-subtle"><Check size={12} aria-hidden="true" />Thêm / xóa thế mới ở chế độ “Form đầy đủ”.</p>
    </div>
  );
}

// ---------- Bảng chấm ----------

const HARD_WHY: Record<string, string> = {
  trunk_changed: 'Đường cong, vị trí gốc, độ nghiêng, sẹo, u của thân khác ảnh gốc.',
  trunk_too_thick: 'Thân dày lên quá mức so với số năm và tốc độ lớn của loài.',
  removed_branch_present: 'Cành đã đánh dấu phải cắt vẫn còn trên ảnh.',
  extra_trunk_or_major_branch: 'Mọc thêm thân hoặc cành lớn không có trong thiết kế.',
  wrong_species_foliage: 'Lá không đúng loài cây.',
  camera_or_background_changed: 'Đổi góc chụp, khung hình hoặc nền.',
  pot_style_wrong: 'Chậu khác thiết kế (dáng, màu, vị trí).',
};

export function JudgingVisual({ value, base, onChange, readOnly }: Props) {
  const crit = (value.criteria ?? {}) as Record<string, { weight: number; check?: string[] }>;
  const total = Object.values(crit).reduce((s, c) => s + (c.weight || 0), 0);
  const hard = (value.fidelity_hard_fail ?? []) as string[];
  const baseHard = (get(base, ['fidelity_hard_fail']) ?? []) as string[];
  const pass = value.pass_score as number;
  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-card border border-line bg-surface p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <h3 className="m-0 text-caption font-semibold">Trọng số tiêu chí (phần B — thẩm mỹ)</h3>
          <span className={cx('rounded-chip px-2 text-label font-semibold', total === 100 ? 'bg-primary-soft text-primary-ink' : 'bg-danger-soft text-danger')}>
            Tổng {total}/100{total === 100 ? '' : ' — cần bằng 100'}
          </span>
        </div>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {Object.entries(crit).map(([k, c]) => (
            <li key={k} className="grid gap-2 md:grid-cols-[180px_1fr_auto] md:items-center">
              <span className="text-caption font-medium">{({ trunk_nebari: 'Thân & rễ', branches: 'Cành', foliage_pads: 'Tầng lá', apex: 'Ngọn', proportions: 'Tỉ lệ', pot_harmony: 'Chậu hài hòa', realism_age: 'Độ già hợp lý', overall: 'Tổng thể' } as Record<string, string>)[k] ?? keyLabel(k)}</span>
              <span className="flex flex-col gap-1">
                <span className="h-3 rounded-full bg-surface-2"><span className="block h-full rounded-full bg-primary" style={{ width: `${Math.min(100, c.weight * 3)}%` }} /></span>
                <span className="text-label text-ink-muted">{(c.check ?? []).map(termLabel).join(' · ')}</span>
              </span>
              <span className="flex items-center gap-1">
                <Stepper label={`Trọng số ${k}`} value={c.weight} step={5} max={60} readOnly={readOnly} onChange={(n) => onChange(setIn(value, ['criteria', k, 'weight'], n) as Doc)} />
                <Changed on={c.weight !== get(base, ['criteria', k, 'weight'])} />
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3 text-caption">
          <span className="font-semibold">Điểm đạt</span>
          <Stepper label="Điểm đạt" value={pass} step={5} max={100} readOnly={readOnly} onChange={(n) => onChange(setIn(value, ['pass_score'], n) as Doc)} />
          <span className="text-ink-muted">/100 và không dính lỗi loại thẳng</span>
          <Changed on={pass !== get(base, ['pass_score'])} />
          <span className="relative h-3 min-w-[160px] flex-1 rounded-full bg-gradient-to-r from-danger-soft to-primary-soft">
            <span className="absolute top-[-3px] h-[18px] w-1 rounded bg-ink" style={{ left: `${pass}%` }} aria-hidden="true" />
          </span>
        </div>
      </section>
      <section>
        <h3 className="m-0 mb-2 text-caption font-semibold">Lỗi loại thẳng (phần A — ảnh sai so với phôi / thiết kế) <span className="font-normal text-ink-subtle">· dính một lỗi là không đạt</span></h3>
        <ul className="m-0 grid list-none gap-2 p-0 sm:grid-cols-2 xl:grid-cols-4">
          {[...new Set([...Object.keys(HARD_WHY), ...hard])].map((code) => {
            const on = hard.includes(code);
            return (
              <li key={code} className={cx('flex flex-col gap-1 rounded-card border bg-surface p-3', on ? 'border-danger' : 'border-dashed border-line opacity-60')}>
                <span className="flex items-center gap-1.5 text-caption font-semibold">{termLabel(code)}<Changed on={on !== baseHard.includes(code)} /></span>
                <span className="text-label text-ink-muted">{HARD_WHY[code] ?? ''}</span>
                <label className="mt-auto flex min-h-touch cursor-pointer items-center gap-2 text-label font-medium">
                  <input type="checkbox" role="switch" className="switch" checked={on} disabled={readOnly} aria-label={`Lỗi loại thẳng: ${termLabel(code)}`}
                    onChange={() => onChange(setIn(value, ['fidelity_hard_fail'], on ? hard.filter((c) => c !== code) : [...hard, code]) as Doc)} />
                  {on ? 'Loại thẳng' : 'Không xét'}
                </label>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
