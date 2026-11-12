import { ok, route } from '@/lib/api';
import { clearSession } from '@/lib/session';
export const dynamic = 'force-dynamic';
export const POST = route(async () => { clearSession(); return ok({ ok: true }); });
