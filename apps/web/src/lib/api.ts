const BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';
const TOKEN_KEY = 'bonsai.token';

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: 'player' | 'nursery' | 'admin';
  credits: number;
}

export interface TokenResponse {
  access_token: string;
  user: User;
  is_new: boolean;
}

export interface PresignResponse {
  key: string;
  url: string;
  method: 'PUT';
  headers: Record<string, string>;
  expires_in: number;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const tokenStore = {
  get: (): string | null => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  set: (t: string | null) => {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* chế độ riêng tư: chỉ giữ trong phiên */
    }
  },
};

const NETWORK_ERROR = 'Không kết nối được máy chủ. Bạn kiểm tra mạng rồi thử lại nhé.';

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = tokenStore.get();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  let body = init.body;
  if (init.json !== undefined) {
    headers.set('Content-Type', 'application/json');
    body = JSON.stringify(init.json);
  }
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers, body });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }
  if (res.status === 401) tokenStore.set(null);
  if (!res.ok) {
    let message = 'Có lỗi xảy ra, bạn thử lại sau ít phút.';
    try {
      const data = await res.json();
      if (typeof data.detail === 'string') message = data.detail;
    } catch {
      /* body không phải JSON */
    }
    throw new ApiError(res.status, message);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

export const auth = {
  google: (idToken: string) => api<TokenResponse>('/auth/google', { method: 'POST', json: { id_token: idToken } }),
  zalo: (code: string, codeVerifier: string) =>
    api<TokenResponse>('/auth/zalo', { method: 'POST', json: { code, code_verifier: codeVerifier } }),
  me: () => api<User>('/me'),
};

/** Tải ảnh lên R2 bằng URL ký sẵn; trả về key để gắn vào cây. */
export async function uploadPhoto(file: Blob): Promise<string> {
  const presign = await api<PresignResponse>('/uploads/presign', {
    method: 'POST',
    json: { content_type: file.type, size_bytes: file.size },
  });
  let res: Response;
  try {
    res = await fetch(presign.url, { method: 'PUT', headers: presign.headers, body: file });
  } catch {
    throw new ApiError(0, NETWORK_ERROR);
  }
  if (!res.ok) throw new ApiError(res.status, 'Tải ảnh lên chưa được, bạn thử lại nhé.');
  return presign.key;
}
