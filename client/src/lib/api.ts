type Json = Record<string, any>;

async function request<T>(method: string, url: string, body?: any, opts?: RequestInit): Promise<T> {
  const init: RequestInit = { method, ...opts };

  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers = { "Content-Type": "application/json", ...(opts?.headers || {}) };
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `${method} ${url} failed (${res.status})`);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return (await res.json()) as T;
  return (await res.text()) as unknown as T;
}

async function requestBlob(url: string): Promise<Blob> {
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `GET ${url} failed (${res.status})`);
  }
  return res.blob();
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: Json | FormData) => request<T>("POST", url, body),
  patch: <T>(url: string, body: Json) => request<T>("PATCH", url, body),
  del: <T>(url: string) => request<T>("DELETE", url),
  getBlob: (url: string) => requestBlob(url),
};
