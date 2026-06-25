import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { MarkdownEditor } from '@/components/admin/markdown-editor';
import { isAdminSession } from '@/lib/server/auth';
import { listDocuments, readDocumentFile } from '@/lib/server/repositories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function EditPage(props: {
  params: Promise<{ repoId: string }>;
  searchParams: Promise<{ path?: string }>;
}) {
  if (!(await isAdminSession())) redirect('/login?redirectTo=/admin/repos');

  const { repoId } = await props.params;
  const searchParams = await props.searchParams;
  const docs = listDocuments(repoId);

  if (!searchParams.path) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 px-4 py-8">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-semibold">Choose a file to edit</h1>
          <Link href="/admin/repos" className="rounded-md border px-3 py-2 text-sm hover:bg-fd-accent">
            Repositories
          </Link>
        </div>
        <div className="divide-y rounded-md border">
          {docs.length === 0 ? (
            <p className="p-4 text-sm text-fd-muted-foreground">No Markdown files are indexed.</p>
          ) : (
            docs.map((doc) => (
              <Link key={doc.path} className="block p-3 hover:bg-fd-accent" href={`/admin/repos/${encodeURIComponent(repoId)}/edit?path=${encodeURIComponent(doc.path)}`}>
                <p className="font-medium">{doc.title}</p>
                <p className="text-xs text-fd-muted-foreground">{doc.path}</p>
              </Link>
            ))
          )}
        </div>
      </main>
    );
  }

  const file = await readDocumentFile(repoId, searchParams.path).catch(() => undefined);
  if (!file) notFound();

  return (
    <MarkdownEditor
      repoId={repoId}
      repoLabel={`${file.repo.owner}/${file.repo.name}`}
      path={file.path}
      initialContent={file.raw}
      initialHash={file.hash}
      initialCommit={file.commit}
    />
  );
}
