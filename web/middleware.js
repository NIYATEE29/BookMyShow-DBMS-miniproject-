// Front-end route protection:
//   /admin    -> ADMIN (platform) or THEATRE_ADMIN (one theatre)
//   /customer -> CUSTOMER
import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const secret = () =>
  new TextEncoder().encode(process.env.JWT_SECRET || 'dev-secret-change-me-please-123456');

export async function middleware(req) {
  const { pathname } = req.nextUrl;
  const token = req.cookies.get('session')?.value;
  let role = null;
  if (token) {
    try {
      role = (await jwtVerify(token, secret())).payload.role;
    } catch {}
  }
  const login = new URL('/login', req.url);
  if (pathname.startsWith('/admin') && role !== 'ADMIN' && role !== 'THEATRE_ADMIN') return NextResponse.redirect(login);
  if (pathname.startsWith('/customer') && role !== 'CUSTOMER') return NextResponse.redirect(login);
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*', '/customer/:path*'] };
