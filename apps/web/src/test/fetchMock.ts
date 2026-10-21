type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

export function sse(events: unknown[]) {
  const text = events.map((e) => `event: job\ndata: ${JSON.stringify(e)}\n\n`).join('');
  return new Response(`retry: 3000\n\n${text}`, { headers: { 'Content-Type': 'text/event-stream' } });
}

/** Thay fetch toàn cục; trả mảng các lời gọi để kiểm tra. */
export function mockFetch(routes: Array<[string | RegExp, Handler]>) {
  const calls: Array<{ url: string; method: string; body: unknown }> = [];
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = String(input);
    const method = init.method ?? 'GET';
    let body: unknown = init.body;
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {
        /* giữ chuỗi */
      }
    }
    calls.push({ url, method, body });
    for (const [pattern, handler] of routes) {
      const key = `${method} ${url}`;
      if (typeof pattern === 'string' ? key === pattern : pattern.test(key)) return handler(url, init);
    }
    throw new Error(`unmocked fetch ${method} ${url}`);
  });
  return calls;
}
