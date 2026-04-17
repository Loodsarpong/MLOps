import { NextResponse, type NextRequest } from 'next/server';

// Edge middleware: gate authenticated sections. Full session verification
// happens server-side; this is a coarse gate for UX.
export function middleware(req: NextRequest) {
  const protectedPrefixes = ['/dashboard', '/pos', '/sales', '/invoices', '/inventory',
    '/customers', '/suppliers', '/products', '/procurement', '/payroll', '/reports', '/settings'];
  const needsAuth = protectedPrefixes.some((p) => req.nextUrl.pathname.startsWith(p));
  if (!needsAuth) return NextResponse.next();

  const hasCookie = req.cookies.has('ns_auth');
  if (!hasCookie) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icons).*)'],
};
