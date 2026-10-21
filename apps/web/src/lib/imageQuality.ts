// Kiểm tra ảnh ngay trên máy (màn 02): độ sáng trung bình và độ nét (phương sai Laplacian).

export const QUALITY = {
  /** cạnh dài khi lấy mẫu; ngưỡng bên dưới được chỉnh theo kích thước này */
  sampleEdge: 256,
  darkBelow: 55,
  brightAbove: 215,
  blurryBelow: 40,
};

export type QualityIssue = 'dark' | 'bright' | 'blurry';

export interface Quality {
  brightness: number;
  sharpness: number;
  issue: QualityIssue | null;
}

export function measure(rgba: Uint8ClampedArray, width: number, height: number): Quality {
  const n = width * height;
  const gray = new Float32Array(n);
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const g = 0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2];
    gray[i] = g;
    sum += g;
  }
  const brightness = sum / n;
  let lsum = 0;
  let lsq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x;
      const l = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - width] - gray[i + width];
      lsum += l;
      lsq += l * l;
      count++;
    }
  }
  const mean = count ? lsum / count : 0;
  const sharpness = count ? lsq / count - mean * mean : 0;
  let issue: QualityIssue | null = null;
  if (brightness < QUALITY.darkBelow) issue = 'dark';
  else if (brightness > QUALITY.brightAbove) issue = 'bright';
  else if (sharpness < QUALITY.blurryBelow) issue = 'blurry';
  return { brightness, sharpness, issue };
}

let scratch: HTMLCanvasElement | null = null;

/** Lấy mẫu một khung hình (video, ảnh) ở kích thước nhỏ rồi đo. */
export function measureSource(source: CanvasImageSource, srcW: number, srcH: number): Quality | null {
  if (!srcW || !srcH) return null;
  const scale = QUALITY.sampleEdge / Math.max(srcW, srcH);
  const w = Math.max(8, Math.round(srcW * scale));
  const h = Math.max(8, Math.round(srcH * scale));
  scratch ??= document.createElement('canvas');
  scratch.width = w;
  scratch.height = h;
  const ctx = scratch.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);
  return measure(ctx.getImageData(0, 0, w, h).data, w, h);
}

export const issueText: Record<QualityIssue, string> = {
  dark: 'Hơi tối · ra chỗ sáng hơn',
  bright: 'Quá chói · tránh nắng gắt',
  blurry: 'Ảnh rung · giữ máy chắc tay',
};
