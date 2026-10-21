import { ApiError, tokenStore } from './api';

function parseBlock(block: string): { event: string; data: string } | null {
  let event = 'message';
  const data: string[] = [];
  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  }
  return data.length ? { event, data: data.join('\n') } : null;
}

/**
 * Đọc SSE bằng fetch (gửi được header Authorization). Tự kết nối lại khi rớt mạng;
 * dừng khi `isTerminal` đúng hoặc khi gọi hàm trả về.
 */
export function watchSse<T>(
  path: string,
  eventName: string,
  onEvent: (e: T) => void,
  isTerminal: (e: T) => boolean,
  onError: (e: ApiError) => void,
): () => void {
  const ctrl = new AbortController();
  const base = import.meta.env.VITE_API_BASE ?? '/api/v1';
  let failures = 0;

  const run = async () => {
    while (!ctrl.signal.aborted) {
      let ended = false;
      try {
        const token = tokenStore.get();
        const res = await fetch(`${base}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: ctrl.signal });
        if (!res.ok || !res.body) throw new ApiError(res.status, 'Mất kết nối với máy chủ.');
        failures = 0;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buf.indexOf('\n\n')) >= 0) {
            const block = parseBlock(buf.slice(0, idx));
            buf = buf.slice(idx + 2);
            if (block?.event === eventName) {
              const ev = JSON.parse(block.data) as T;
              onEvent(ev);
              if (isTerminal(ev)) ended = true;
            }
          }
        }
      } catch (e) {
        if (ctrl.signal.aborted) return;
        failures++;
        if (e instanceof ApiError && (e.status === 401 || e.status === 404)) {
          onError(e);
          return;
        }
        if (failures >= 5) {
          onError(new ApiError(0, 'Mất kết nối. Bạn kiểm tra mạng rồi mở lại trang này nhé.'));
          return;
        }
      }
      if (ended) return;
      await new Promise((r) => setTimeout(r, Math.min(10000, 1500 * 2 ** failures)));
    }
  };
  void run();
  return () => ctrl.abort();
}
