import { ok, route } from '@/lib/api';
import { getSession } from '@/lib/session';
export const dynamic = 'force-dynamic';
export const GET = route(async () => ok({ user: await getSession() }));
