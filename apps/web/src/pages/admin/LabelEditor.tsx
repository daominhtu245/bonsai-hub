import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { ChevronLeft, Eye, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Button, Notice, Segmented, Skeleton } from '@/components/ui';
import { ApiError } from '@/lib/api';
import { cx } from '@/lib/cx';
import { labelsApi, type LabelDetail, type LabelObject, type SegClass } from '@/lib/labels';

const CLASS_COLOR_VAR: Record<SegClass, string> = { trunk: '--leaf', branch: '--brass', root: '--seal' };
const CLASS_NAME: Record<SegClass, string> = { trunk: 'Thân', branch: 'Cành', root: 'Rễ' };

type Tool = 'brush' | 'eraser' | 'lasso' | 'lasso-erase';

interface EditObject extends LabelObject {
  canvas: HTMLCanvasElement; // alpha = mask
  dirty: boolean;
  isNew: boolean;
}

function blankCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** PNG trắng/đen → canvas có alpha (trắng = đối tượng), để tô màu bằng 'source-in'. */
function toAlphaCanvas(bitmap: ImageBitmap, w: number, h: number) {
  const c = blankCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const on = d[i] > 127;
    d[i] = d[i + 1] = d[i + 2] = 255;
    d[i + 3] = on ? 255 : 0;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function exportPng(mask: HTMLCanvasElement): Promise<Blob> {
  const out = blankCanvas(mask.width, mask.height);
  const ctx = out.getContext('2d')!;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.drawImage(mask, 0, 0);
  return new Promise((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png'));
}

function isEmpty(mask: HTMLCanvasElement) {
  const d = mask.getContext('2d', { willReadFrequently: true })!.getImageData(0, 0, mask.width, mask.height).data;
  for (let i = 3; i < d.length; i += 4) if (d[i]) return false;
  return true;
}

function objName(o: LabelObject) {
  return o.cls === 'branch' ? `${CLASS_NAME.branch} ${o.id.replace('branch_', '')}` : CLASS_NAME[o.cls];
}

/** /admin/gan-nhan/:id — sửa mask nháp thân / cành / rễ bằng cọ, tẩy; đánh dấu đúng/sai từng đối tượng. */
export default function LabelEditor() {
  const { labelId = '' } = useParams();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<LabelDetail | null>(null);
  const [objects, setObjects] = useState<EditObject[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('brush');
  const [size, setSize] = useState(24);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<null | 'save' | 'review' | 'reject'>(null);
  const overlay = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<{ x: number; y: number } | null>(null);
  const lasso = useRef<Array<{ x: number; y: number }> | null>(null);
  const frame = useRef(0);
  const counter = useRef(1);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError(null);
    labelsApi
      .get(labelId)
      .then(async (d) => {
        const objs = await Promise.all(
          d.objects.map(async (o) => ({ ...o, canvas: toAlphaCanvas(await labelsApi.maskBitmap(d.id, o.id), d.width, d.height), dirty: false, isNew: false })),
        );
        if (cancelled) return;
        setDetail(d);
        setObjects(objs);
        setSelected(objs[0]?.id ?? null);
      })
      .catch((e: ApiError) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [labelId]);

  const render = useCallback(() => {
    const c = overlay.current;
    if (!c || !detail) return;
    const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height);
    if (hidden) return;
    const style = getComputedStyle(c);
    const scratch = blankCanvas(c.width, c.height);
    const sctx = scratch.getContext('2d')!;
    for (const o of objects) {
      sctx.globalCompositeOperation = 'source-over';
      sctx.clearRect(0, 0, c.width, c.height);
      sctx.drawImage(o.canvas, 0, 0);
      sctx.globalCompositeOperation = 'source-in';
      sctx.fillStyle = style.getPropertyValue(CLASS_COLOR_VAR[o.cls]).trim() || '#000';
      sctx.fillRect(0, 0, c.width, c.height);
      ctx.globalAlpha = !o.accepted ? 0.15 : o.id === selected ? 0.7 : 0.45;
      ctx.drawImage(scratch, 0, 0);
    }
    ctx.globalAlpha = 1;
    const path = lasso.current;
    if (path && path.length > 1) {
      ctx.strokeStyle = style.getPropertyValue('--ink').trim() || '#000';
      ctx.lineWidth = Math.max(2, c.width / 400);
      ctx.setLineDash([8, 6]);
      ctx.beginPath();
      path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [objects, selected, hidden, detail]);

  useEffect(render, [render]);

  const toImage = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * e.currentTarget.width, y: ((e.clientY - r.top) / r.height) * e.currentTarget.height };
  };

  const paint = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const o = objects.find((x) => x.id === selected);
    if (!o) return;
    const ctx = o.canvas.getContext('2d')!;
    ctx.globalCompositeOperation = tool === 'brush' ? 'source-over' : 'destination-out';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = size;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    o.dirty = true;
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(render);
  };

  /** Khoanh vùng: tô (hoặc xóa) cả phần bên trong đường bao — nhanh hơn cọ khi sửa thân to. */
  const fillLasso = (path: Array<{ x: number; y: number }>) => {
    const o = objects.find((x) => x.id === selected);
    if (!o || path.length < 3) return;
    const ctx = o.canvas.getContext('2d')!;
    ctx.globalCompositeOperation = tool === 'lasso' ? 'source-over' : 'destination-out';
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    path.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
    ctx.closePath();
    ctx.fill();
    o.dirty = true;
  };

  const onDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!selected) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = toImage(e);
    if (tool === 'lasso' || tool === 'lasso-erase') {
      lasso.current = [p];
      return;
    }
    stroke.current = p;
    paint(p, p);
  };
  const onMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (lasso.current) {
      lasso.current.push(toImage(e));
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(render);
      return;
    }
    if (!stroke.current) return;
    const p = toImage(e);
    paint(stroke.current, p);
    stroke.current = p;
  };
  const onUp = () => {
    if (lasso.current) fillLasso(lasso.current);
    lasso.current = null;
    stroke.current = null;
    setObjects((list) => [...list]); // vẽ lại + cập nhật trạng thái "chưa lưu"
  };

  const addObject = (cls: SegClass) => {
    if (!detail) return;
    let id: string = cls;
    if (cls === 'branch') {
      while (objects.some((o) => o.id === `branch_m${counter.current}`)) counter.current += 1;
      id = `branch_m${counter.current++}`;
    }
    const o: EditObject = { id, cls, accepted: true, source: 'manual', canvas: blankCanvas(detail.width, detail.height), dirty: true, isNew: true };
    setObjects((list) => [...list, o]);
    setSelected(id);
    setTool('brush');
  };

  const update = (id: string, patch: Partial<EditObject>) => setObjects((list) => list.map((o) => (o.id === id ? Object.assign(o, patch) : o)));
  const remove = (id: string) => {
    setObjects((list) => list.filter((o) => o.id !== id));
    if (selected === id) setSelected(null);
  };

  const save = async (status?: 'reviewed' | 'rejected') => {
    if (!detail) return;
    setSaving(status === 'reviewed' ? 'review' : status === 'rejected' ? 'reject' : 'save');
    setError(null);
    try {
      const keep: EditObject[] = [];
      for (const o of objects) {
        if (o.isNew && isEmpty(o.canvas)) continue; // đối tượng mới chưa tô gì → bỏ
        if (o.dirty) await labelsApi.putMask(detail.id, o.id, await exportPng(o.canvas), o.isNew ? o.cls : undefined);
        o.dirty = o.isNew = false;
        keep.push(o);
      }
      const d = await labelsApi.save(detail.id, { status, objects: keep.map(({ id, cls, accepted }) => ({ id, cls, accepted })) });
      setObjects(keep);
      setDetail(d);
      if (status) navigate(d.next_id ? `/admin/gan-nhan/${d.next_id}` : '/admin/gan-nhan');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Chưa lưu được, thử lại.');
    } finally {
      setSaving(null);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === 'INPUT') return;
      if (e.key === 'b') setTool('brush');
      else if (e.key === 'e') setTool('eraser');
      else if (e.key === 'l') setTool('lasso');
      else if (e.key === 'k') setTool('lasso-erase');
      else if (e.key === '[') setSize((s) => Math.max(2, s - 4));
      else if (e.key === ']') setSize((s) => Math.min(120, s + 4));
      else if (e.key === 'h') setHidden(true);
    };
    const onKeyUp = (e: KeyboardEvent) => e.key === 'h' && setHidden(false);
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  const unsaved = objects.some((o) => o.dirty);
  const hasRoot = objects.some((o) => o.cls === 'root');
  const hasTrunk = objects.some((o) => o.cls === 'trunk');

  return (
    <div className="flex flex-col">
      <Link to="/admin/gan-nhan" className="mb-2 inline-flex items-center gap-1 text-caption text-ink-muted no-underline hover:text-ink"><ChevronLeft size={16} />Gán nhãn</Link>
      {error ? <div className="pb-3"><Notice tone="danger">{error}</Notice></div> : null}
      {!detail ? (
        error ? null : <Skeleton className="aspect-[4/3] w-full rounded-card" />
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="min-w-0 flex-1">
            {/* Vừa khung nhìn: không rộng quá cột, không cao quá màn hình (ảnh dọc trên màn rộng không phải cuộn). */}
            <div className="relative mx-auto overflow-hidden rounded-card border border-line bg-photo"
              style={{ aspectRatio: `${detail.width} / ${detail.height}`, width: `min(100%, calc((100dvh - 180px) * ${detail.width / detail.height}))` }}>
              <img src={detail.image_url} alt="Ảnh phôi cần gán nhãn" className="absolute inset-0 h-full w-full select-none" draggable={false} />
              <canvas
                ref={overlay}
                width={detail.width}
                height={detail.height}
                aria-label="Lớp mask — kéo để tô hoặc tẩy đối tượng đang chọn"
                className={cx('absolute inset-0 h-full w-full touch-none', selected ? 'cursor-crosshair' : 'cursor-not-allowed')}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
              />
            </div>
            <p className="m-0 mt-2 text-label text-ink-subtle">
              {detail.draft_source === 'sam' ? 'Nháp: SAM' : detail.draft_source === 'geometry' ? 'Nháp: hình học (thô)' : 'Thủ công'}
              {' · '}B cọ · E tẩy · L khoanh tô · K khoanh xóa · [ ] cỡ · giữ H ẩn mask
            </p>
          </div>

          <aside className="flex w-full flex-col gap-4 text-caption lg:sticky lg:top-[76px] lg:w-[320px] 3xl:w-[380px]">
            <div className="flex flex-col gap-2">
              <Segmented<Tool> label="Công cụ" value={tool} onChange={setTool}
                options={[['brush', 'Cọ'], ['eraser', 'Tẩy'], ['lasso', 'Khoanh tô'], ['lasso-erase', 'Khoanh xóa']]} />
              <label className="flex items-center gap-3">
                <span className="w-16 text-ink-muted">Cỡ {size}</span>
                <input type="range" min={2} max={120} value={size} onChange={(e) => setSize(Number(e.target.value))} className="flex-1 accent-[var(--primary)]" />
              </label>
              <button type="button" onPointerDown={() => setHidden(true)} onPointerUp={() => setHidden(false)} onPointerLeave={() => setHidden(false)}
                className="flex min-h-touch items-center justify-center gap-2 rounded-btn border border-line bg-surface text-ink-muted">
                <Eye size={16} aria-hidden="true" /> Giữ để xem ảnh gốc
              </button>
            </div>

            <ul className="m-0 flex list-none flex-col divide-y divide-line overflow-hidden rounded-card border border-line bg-surface p-0">
              {objects.map((o) => (
                <li key={o.id} className={cx('flex min-h-[52px] items-center gap-2 px-3', o.id === selected && 'bg-surface-2')}>
                  <button type="button" onClick={() => setSelected(o.id)} aria-pressed={o.id === selected} className="flex min-h-touch flex-1 items-center gap-2 text-left">
                    <span className="h-3 w-3 flex-none rounded-full" style={{ background: `var(${CLASS_COLOR_VAR[o.cls]})` }} aria-hidden="true" />
                    <span className="font-medium">{objName(o)}</span>
                    {o.dirty ? <span className="text-label text-warn-ink">chưa lưu</span> : null}
                  </button>
                  <label className="flex min-h-touch items-center gap-1.5 text-ink-muted">
                    <input type="checkbox" checked={o.accepted} onChange={(e) => update(o.id, { accepted: e.target.checked })} className="h-4 w-4 accent-[var(--primary)]" />
                    Đúng
                  </label>
                  <button type="button" aria-label={`Xóa ${objName(o)}`} onClick={() => remove(o.id)} className="flex h-touch w-touch items-center justify-center text-ink-subtle hover:text-danger">
                    <Trash2 size={16} aria-hidden="true" />
                  </button>
                </li>
              ))}
              {objects.length === 0 ? <li className="px-3 py-4 text-ink-muted">Chưa có đối tượng</li> : null}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="touch" block={false} onClick={() => addObject('branch')}><Plus size={16} aria-hidden="true" />Cành</Button>
              {!hasRoot ? <Button variant="secondary" size="touch" block={false} onClick={() => addObject('root')}><Plus size={16} aria-hidden="true" />Rễ</Button> : null}
              {!hasTrunk ? <Button variant="secondary" size="touch" block={false} onClick={() => addObject('trunk')}><Plus size={16} aria-hidden="true" />Thân</Button> : null}
              <Button variant="ghost" size="touch" block={false} onClick={() => labelsApi.redraft(detail.id).then(() => navigate('/admin/gan-nhan'))}>
                <RotateCcw size={16} aria-hidden="true" />Tạo lại nháp
              </Button>
            </div>
            {detail.summary_vi ? <p className="m-0 text-ink-muted">{detail.summary_vi}</p> : null}

            <div className="flex flex-col gap-2">
              <Button onClick={() => save('reviewed')} loading={saving === 'review'} disabled={saving !== null || !hasTrunk}>Duyệt xong · ảnh tiếp</Button>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" size="touch" onClick={() => save()} loading={saving === 'save'} disabled={saving !== null || !unsaved}>Lưu</Button>
                <Button variant="danger" size="touch" onClick={() => save('rejected')} loading={saving === 'reject'} disabled={saving !== null}>Bỏ ảnh</Button>
              </div>
              <Link to="/admin/gan-nhan" className="text-center text-ink-muted">Danh sách ảnh</Link>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
