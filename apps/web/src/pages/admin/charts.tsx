// Biểu đồ SVG cho bảng điều khiển (không thư viện). Màu: token chart-1..3 (đã kiểm tra mù màu, light + dark).
// Quy tắc: nét mảnh, một trục, lưới nhạt, chú thích khi ≥ 2 chuỗi, tooltip khi rê, luôn có chế độ xem bảng.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { cx } from '@/lib/cx';

export interface Series {
  key: string;
  label: string;
  color: string; // var(--chart-n)
}

function useWidth<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => el.clientWidth && setW(Math.max(280, Math.round(el.clientWidth)));
    if (typeof ResizeObserver === 'undefined') { // trình duyệt cũ / jsdom
      measure();
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

function niceTicks(max: number, count = 4): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
}

function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-label text-ink-muted">
      {series.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: s.color }} aria-hidden="true" />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

function DataTableView<T extends { label: string }>({ rows, series, format, valueOf }: { rows: T[]; series: Series[]; format: (n: number) => string; valueOf: (r: T, k: string) => number }) {
  return (
    <div className="max-h-[260px] overflow-auto">
      <table className="w-full border-collapse text-caption">
        <thead><tr className="text-left text-label text-ink-muted"><th className="py-1 pr-3 font-medium">Ngày</th>{series.map((s) => <th key={s.key} className="py-1 pr-3 text-right font-medium">{s.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-t border-line">
              <td className="py-1 pr-3">{r.label}</td>
              {series.map((s) => <td key={s.key} className="tabular py-1 pr-3 text-right">{format(valueOf(r, s.key))}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ChartFrame({ title, series, children, table, summary }: { title: string; series: Series[]; children: ReactNode; table: ReactNode; summary?: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section className="min-w-0 rounded-card border border-line bg-surface p-4 shadow-card">
      <header className="mb-2 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="m-0 text-caption font-semibold">{title}</h2>
          {summary ? <div className="mt-0.5 text-label text-ink-muted">{summary}</div> : null}
        </div>
        <div className="flex items-center gap-3">
          <Legend series={series} />
          <button type="button" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}
            className="min-h-[32px] rounded-btn border border-line px-2 text-label text-ink-muted hover:text-ink">{asTable ? 'Biểu đồ' : 'Bảng'}</button>
        </div>
      </header>
      {asTable ? table : children}
    </section>
  );
}

const PAD = { top: 12, right: 12, bottom: 24, left: 44 };

/** Cột bo 4px ở đầu (phía giá trị), đáy vuông nằm trên trục. */
function roundedTop(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function Tooltip({ x, y, width, children }: { x: number; y: number; width: number; children: ReactNode }) {
  const left = Math.min(Math.max(8, x + 12), width - 180);
  return (
    <div role="tooltip" className="pointer-events-none absolute z-10 min-w-[150px] rounded-btn border border-line bg-surface px-3 py-2 text-label shadow-raised"
      style={{ left, top: Math.max(0, y - 8) }}>
      {children}
    </div>
  );
}

function xLabelEvery(n: number, w: number) {
  return Math.max(1, Math.ceil(n / Math.max(2, Math.floor(w / 64))));
}

/** Cột chồng theo ngày (vd. phiên trả phí / không trả phí). */
export function StackedBars<T extends { label: string }>({ title, rows, series, valueOf, format, height = 220, summary }: {
  title: string; rows: T[]; series: Series[]; valueOf: (r: T, key: string) => number; format: (n: number) => string; height?: number; summary?: ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const totals = rows.map((r) => series.reduce((a, s) => a + valueOf(r, s.key), 0));
  const ticks = niceTicks(Math.max(1, ...totals));
  const top = ticks[ticks.length - 1];
  const iw = width - PAD.left - PAD.right;
  const ih = height - PAD.top - PAD.bottom;
  const slot = iw / Math.max(1, rows.length);
  const bw = Math.max(2, Math.min(28, slot * 0.68));
  const y = (v: number) => PAD.top + ih - (v / top) * ih;
  const every = xLabelEvery(rows.length, iw);

  return (
    <ChartFrame title={title} series={series} summary={summary}
      table={<DataTableView rows={rows} series={series} format={format} valueOf={valueOf} />}>
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={width} height={height} role="img" aria-label={title} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--ink-subtle)">{format(t)}</text>
            </g>
          ))}
          {rows.map((r, i) => {
            const cx0 = PAD.left + slot * i + slot / 2;
            let acc = 0;
            const segs = series.map((s) => {
              const v = valueOf(r, s.key);
              const y1 = y(acc + v), y0 = y(acc);
              acc += v;
              return { s, v, y1, h: Math.max(0, y0 - y1 - (v > 0 && acc < totals[i] ? 2 : 0)) }; // khe 2px giữa các đoạn
            });
            const topIdx = segs.map((g) => g.v > 0).lastIndexOf(true);
            return (
              <g key={r.label} opacity={hover === null || hover === i ? 1 : 0.55}>
                {segs.map((g, k) => g.h > 0 ? (
                  k === topIdx
                    ? <path key={g.s.key} fill={g.s.color} d={roundedTop(cx0 - bw / 2, g.y1, bw, g.h)} />
                    : <rect key={g.s.key} x={cx0 - bw / 2} y={g.y1} width={bw} height={g.h} fill={g.s.color} />
                ) : null)}
                {i % every === 0 ? <text x={cx0} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--ink-subtle)">{r.label}</text> : null}
                <rect x={PAD.left + slot * i} y={PAD.top} width={slot} height={ih} fill="transparent" onMouseEnter={() => setHover(i)} />
              </g>
            );
          })}
          <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--line-strong)" strokeWidth={1} />
        </svg>
        {hover !== null ? (
          <Tooltip x={PAD.left + slot * hover + slot / 2} y={PAD.top} width={width}>
            <div className="mb-1 font-semibold text-ink">{rows[hover].label}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3 text-ink-muted">
                <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />{s.label}</span>
                <span className="tabular text-ink">{format(valueOf(rows[hover], s.key))}</span>
              </div>
            ))}
            {series.length > 1 ? <div className="mt-1 flex justify-between border-t border-line pt-1 text-ink"><span>Tổng</span><span className="tabular">{format(totals[hover])}</span></div> : null}
          </Tooltip>
        ) : null}
      </div>
    </ChartFrame>
  );
}

/** Đường theo ngày, cùng một đơn vị (một trục). */
export function Lines<T extends { label: string }>({ title, rows, series, valueOf, format, height = 220, summary }: {
  title: string; rows: T[]; series: Series[]; valueOf: (r: T, key: string) => number; format: (n: number) => string; height?: number; summary?: ReactNode;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...rows.flatMap((r) => series.map((s) => valueOf(r, s.key))));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1];
  const right = PAD.right + (series.length <= 4 ? 64 : 0); // chỗ cho nhãn trực tiếp ở cuối đường
  const iw = width - PAD.left - right;
  const ih = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (rows.length <= 1 ? iw / 2 : (i / (rows.length - 1)) * iw);
  const y = (v: number) => PAD.top + ih - (v / top) * ih;
  const every = xLabelEvery(rows.length, iw);
  const onMove = (e: React.MouseEvent<SVGRectElement>) => {
    const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (rows.length - 1));
    setHover(Math.min(rows.length - 1, Math.max(0, i)));
  };

  return (
    <ChartFrame title={title} series={series} summary={summary}
      table={<DataTableView rows={rows} series={series} format={format} valueOf={valueOf} />}>
      <div ref={ref} className="relative" onMouseLeave={() => setHover(null)}>
        <svg width={width} height={height} role="img" aria-label={title} className="block">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - right} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={1} />
              <text x={PAD.left - 6} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill="var(--ink-subtle)">{format(t)}</text>
            </g>
          ))}
          {rows.map((r, i) => i % every === 0 ? <text key={r.label} x={x(i)} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--ink-subtle)">{r.label}</text> : null)}
          {series.map((s) => {
            const d = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i)},${y(valueOf(r, s.key))}`).join(' ');
            const last = rows.length - 1;
            return (
              <g key={s.key}>
                <path d={d} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                {series.length <= 4 && last >= 0 ? (
                  <text x={x(last) + 8} y={y(valueOf(rows[last], s.key))} dy="0.32em" fontSize={11} fill="var(--ink-muted)">{s.label}</text>
                ) : null}
              </g>
            );
          })}
          {hover !== null ? (
            <g>
              <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} stroke="var(--line-strong)" strokeWidth={1} />
              {series.map((s) => <circle key={s.key} cx={x(hover)} cy={y(valueOf(rows[hover], s.key))} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />)}
            </g>
          ) : null}
          <rect x={PAD.left} y={PAD.top} width={iw} height={ih} fill="transparent" onMouseMove={onMove} />
        </svg>
        {hover !== null ? (
          <Tooltip x={x(hover)} y={PAD.top} width={width}>
            <div className="mb-1 font-semibold text-ink">{rows[hover].label}</div>
            {series.map((s) => (
              <div key={s.key} className="flex items-center justify-between gap-3 text-ink-muted">
                <span className="flex items-center gap-1.5"><span className="h-0.5 w-3" style={{ background: s.color }} />{s.label}</span>
                <span className="tabular text-ink">{format(valueOf(rows[hover], s.key))}</span>
              </div>
            ))}
          </Tooltip>
        ) : null}
      </div>
    </ChartFrame>
  );
}

/** Phễu: thanh ngang một màu, nhãn số + tỉ lệ so với bước đầu. */
export function Funnel({ title, steps, summary }: { title: string; steps: Array<{ label: string; value: number }>; summary?: ReactNode }) {
  const first = Math.max(1, steps[0]?.value ?? 1);
  const series: Series[] = [{ key: 'v', label: 'Người dùng', color: 'var(--chart-1)' }];
  return (
    <ChartFrame title={title} series={series} summary={summary}
      table={<DataTableView rows={steps} series={series} format={(n) => n.toLocaleString('vi-VN')} valueOf={(r) => r.value} />}>
      <ol className="m-0 flex list-none flex-col gap-2 p-0">
        {steps.map((s, i) => (
          <li key={s.label} className="grid grid-cols-[minmax(96px,30%)_1fr_auto] items-center gap-3 text-caption">
            <span className="truncate text-ink-muted">{s.label}</span>
            <span className="h-3 rounded-[4px] bg-surface-2">
              <span className={cx('block h-3 rounded-[4px]')} style={{ width: `${(s.value / first) * 100}%`, background: 'var(--chart-1)' }} />
            </span>
            <span className="tabular w-[92px] text-right">
              {s.value.toLocaleString('vi-VN')}
              {i > 0 ? <span className="text-ink-subtle"> · {Math.round((s.value / first) * 100)}%</span> : null}
            </span>
          </li>
        ))}
      </ol>
    </ChartFrame>
  );
}
