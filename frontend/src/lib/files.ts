/**
 * Exporting and importing files. Inside the desktop app the raylang backend opens the
 * native save/open dialogs; on the phone it writes exports under the app's
 * Documents/Ray808/exports; in a plain browser the page downloads the file.
 */
import { call, hasBridge, toBase64 } from './bridge';

export type ExportResult = { saved: true; where: string } | { saved: false; cancelled: boolean; error?: string };

function download(blob: Blob, filename: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function exportFile(blob: Blob, filename: string): Promise<ExportResult> {
  if (!hasBridge()) {
    download(blob, filename);
    return { saved: true, where: filename };
  }
  const r = await call('export', { name: filename, data: await toBase64(blob) });
  if (r.ok) return { saved: true, where: String(r.path ?? filename) };
  return { saved: false, cancelled: r.cancelled === true, error: r.error };
}

/** Asks for a JSON file: native dialog when the backend has one, a file input otherwise. */
export async function importJsonText(): Promise<string | null> {
  if (hasBridge()) {
    const r = await call('import');
    if (r.ok && typeof r.text === 'string') return r.text;
    if (r.cancelled) return null;
    // No native dialogs (phone): fall through to the page's own picker.
  }
  return pickFile('application/json').then((f) => (f ? f.text() : null));
}

/** Opens the platform's file picker from an <input type="file">. */
export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.addEventListener('change', () => resolve(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}
