import Link from 'next/link';
import { Compass } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col items-center justify-center text-center">
      <Compass className="mb-3 h-10 w-10 text-shea-300" />
      <h1 className="text-xl font-semibold text-shea-900">Page not found</h1>
      <p className="mt-1 text-sm text-shea-700">
        The page you’re looking for hasn’t been built yet.
      </p>
      <Link
        href="/dashboard"
        className="mt-4 rounded-md bg-shea-700 px-3 py-1.5 text-sm text-white hover:bg-shea-900"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
