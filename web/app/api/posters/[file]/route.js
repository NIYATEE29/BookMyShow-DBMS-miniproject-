// GET /api/posters/:file – serves an uploaded poster image
import { readPoster } from '@/lib/posters';

export const dynamic = 'force-dynamic';

export async function GET(_req, { params }) {
  const img = await readPoster(params.file);
  if (!img) return new Response('Not found', { status: 404 });
  return new Response(img.buf, {
    headers: {
      'Content-Type': img.type,
      'Cache-Control': 'public, max-age=31536000, immutable', // file names are unique per upload
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
