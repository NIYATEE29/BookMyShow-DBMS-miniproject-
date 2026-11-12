// Poster uploads: stored on disk in web/uploads/posters, served by /api/posters/<file>.
// (Files written into /public after `next build` are not served in production,
//  so uploads go through a tiny route instead.)
import { mkdir, writeFile, unlink, readFile } from 'fs/promises';
import path from 'path';
import { HttpError } from '@/lib/api';

export const POSTER_DIR = path.join(process.cwd(), 'uploads', 'posters');
export const MAX_BYTES = 3 * 1024 * 1024; // 3 MB
const PREFIX = '/api/posters/';
export const TYPES = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
export const SAFE_NAME = /^\d+-\d+\.(jpg|png|webp)$/;

// detect the real image type from the file's first bytes (don't trust the browser's mime type)
function sniff(b) {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

export async function savePoster(movieId, file) {
  if (!file || typeof file.arrayBuffer !== 'function') throw new HttpError(400, 'Please choose an image file.');
  if (file.size > MAX_BYTES) throw new HttpError(400, 'Poster must be 3 MB or smaller.');
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = sniff(buf);
  if (!ext) throw new HttpError(400, 'Poster must be a JPG, PNG or WebP image.');
  await mkdir(POSTER_DIR, { recursive: true });
  const name = `${Number(movieId)}-${Date.now()}.${ext}`;
  await writeFile(path.join(POSTER_DIR, name), buf);
  return PREFIX + name;
}

// delete a previously uploaded file (default artwork in /public/posters is left alone)
export async function removePoster(url) {
  if (!url || !url.startsWith(PREFIX)) return;
  const name = url.slice(PREFIX.length);
  if (!SAFE_NAME.test(name)) return;
  try { await unlink(path.join(POSTER_DIR, name)); } catch {}
}

export async function readPoster(name) {
  if (!SAFE_NAME.test(name)) return null;
  try {
    return { buf: await readFile(path.join(POSTER_DIR, name)), type: TYPES[name.split('.').pop()] };
  } catch {
    return null;
  }
}
