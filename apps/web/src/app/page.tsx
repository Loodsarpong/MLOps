import Link from 'next/link';

export default function Home() {
  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-3xl font-semibold">NaturalShea Care — ERP</h1>
      <p className="mt-2 text-shea-700">Manufacturing · Inventory · Sales · Distribution</p>
      <div className="mt-8 flex gap-3">
        <Link
          className="rounded-lg bg-shea-700 px-4 py-2 text-white hover:bg-shea-900"
          href="/login"
        >
          Sign in
        </Link>
        <Link className="rounded-lg border border-shea-700 px-4 py-2" href="/dashboard">
          Open dashboard
        </Link>
      </div>
    </main>
  );
}
