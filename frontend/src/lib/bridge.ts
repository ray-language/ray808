/**
 * The page's side of the raylang backend (src/api.ray). Inside the app every webview
 * has `window.ray.request(value)`, which resolves with the backend's reply (a JSON
 * string). Opened in a plain browser (`npm run dev`, tests) there is no bridge, and
 * callers fall back to browser storage and downloads.
 */

interface RayBridge {
  request: (value: unknown) => Promise<unknown>;
  send?: (value: unknown) => void;
}

declare global {
  interface Window {
    ray?: RayBridge;
  }
}

export interface Reply {
  ok: boolean;
  error?: string;
  cancelled?: boolean;
  [key: string]: unknown;
}

export function hasBridge(): boolean {
  return typeof window !== 'undefined' && typeof window.ray?.request === 'function';
}

/** A reply that never comes must not freeze the page (a shell that drops it, a busy backend). */
const TIMEOUT_MS = 8000;

/** Sends `{op, ...args}` to raylang and parses its reply. Never throws. */
export async function call(op: string, args: Record<string, unknown> = {}): Promise<Reply> {
  if (!hasBridge()) return { ok: false, error: 'no bridge' };
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`${op}: no reply`)), TIMEOUT_MS));
    const raw = await Promise.race([window.ray!.request({ op, ...args }), timeout]);
    const reply = (typeof raw === 'string' ? JSON.parse(raw) : raw) as Reply;
    return reply && typeof reply === 'object' ? reply : { ok: false, error: 'bad reply' };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export interface Hello {
  platform: string;
  dialogs: boolean;
  /** Development: a dev server the page should move to (RAY808_DEV_URL), or "". */
  devUrl: string;
}

/** What the backend says about the platform; null outside the app. */
export async function hello(): Promise<Hello | null> {
  const r = await call('hello');
  if (!r.ok) return null;
  return { platform: String(r.platform ?? ''), dialogs: r.dialogs === true, devUrl: String(r.devUrl ?? '') };
}

/* ---------- base64 for the byte payloads ---------- */

export async function toBase64(data: ArrayBuffer | Blob): Promise<string> {
  const blob = data instanceof Blob ? data : new Blob([data]);
  const url: string = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(',') + 1);
}

export function fromBase64(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}
