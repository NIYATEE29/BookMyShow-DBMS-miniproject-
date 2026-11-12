// POST /api/bookings/:id/cancel – sp_cancel_booking
//   customer: own booking, before the show · platform ADMIN: any booking
//   (the procedure locks the booking row with SELECT ... FOR UPDATE, so two
//    simultaneous cancels/refunds can never refund twice)
import { q } from '@/lib/db';
import { route, ok } from '@/lib/api';
import { requireRole } from '@/lib/session';

export const dynamic = 'force-dynamic';

export const POST = route(async (_req, { params }) => {
  const s = await requireRole(['CUSTOMER', 'ADMIN']);
  await q(s.role, 'CALL sp_cancel_booking(?, ?)', [params.id, s.uid]);
  return ok({ cancelled: true });
});
