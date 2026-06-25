import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-6 px-4 py-12">
      <div>
        <h1 className="text-3xl font-semibold">Markdown Reader</h1>
        <p className="mt-3 max-w-2xl text-fd-muted-foreground">
          Self-hosted GitHub Markdown reader with repository sync, formulas, search, notes, and direct Git writeback.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <Link href="/docs" className="rounded-md bg-fd-primary px-4 py-2 text-sm font-medium text-fd-primary-foreground">
          Open reader
        </Link>
        <Link href="/admin/repos" className="rounded-md border px-4 py-2 text-sm hover:bg-fd-accent">
          Manage repositories
        </Link>
      </div>
    </div>
  );
}
