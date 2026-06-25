import Link from 'next/link';
import {
  DocsBody,
  DocsDescription,
  DocsPage,
  DocsTitle,
} from 'fumadocs-ui/layouts/docs/page';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { NotePanel } from '@/components/reader/note-panel';
import { SearchPanel } from '@/components/reader/search-panel';
import { renderMarkdown } from '@/lib/server/markdown';
import { hrefForDoc, relativePathFromSlug } from '@/lib/server/paths';
import { getDocument, getFirstDocument, getRepository, listRepositories, readDocumentFile } from '@/lib/server/repositories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Page(props: PageProps<'/docs/[[...slug]]'>) {
  const params = await props.params;
  const [repoId, ...pathSlug] = params.slug ?? [];

  if (!repoId) {
    const repositories = listRepositories();

    return (
      <DocsPage tableOfContent={{ enabled: false }}>
        <DocsTitle>Repositories</DocsTitle>
        <DocsDescription>Browse cloned Markdown repositories and search indexed documents.</DocsDescription>
        <DocsBody>
          <div className="not-prose mb-6">
            <SearchPanel />
          </div>
          {repositories.length === 0 ? (
            <div className="not-prose rounded-md border p-4 text-sm text-fd-muted-foreground">
              No repositories have been added. Open <Link href="/admin/repos" className="underline">repository admin</Link> to add one.
            </div>
          ) : (
            <div className="not-prose grid gap-3">
              {repositories.map((repo) => {
                const first = getFirstDocument(repo.id);
                return (
                  <Link
                    key={repo.id}
                    href={first ? hrefForDoc(repo.id, first.path) : `/docs/${encodeURIComponent(repo.id)}`}
                    className="rounded-md border p-4 hover:bg-fd-accent"
                  >
                    <p className="font-medium">{repo.owner}/{repo.name}</p>
                    <p className="text-sm text-fd-muted-foreground">{repo.status}</p>
                  </Link>
                );
              })}
            </div>
          )}
        </DocsBody>
      </DocsPage>
    );
  }

  const repo = getRepository(repoId);
  if (!repo) notFound();

  if (pathSlug.length === 0) {
    const first = getFirstDocument(repoId);
    if (!first) {
      return (
        <DocsPage tableOfContent={{ enabled: false }}>
          <DocsTitle>{repo.owner}/{repo.name}</DocsTitle>
          <DocsDescription>No Markdown files are indexed for this repository yet.</DocsDescription>
          <DocsBody>
            <div className="not-prose flex gap-2">
              <Link href="/admin/repos" className="rounded-md border px-3 py-2 text-sm hover:bg-fd-accent">
                Repository admin
              </Link>
            </div>
          </DocsBody>
        </DocsPage>
      );
    }

    return (
      <DocsPage tableOfContent={{ enabled: false }}>
        <DocsTitle>{repo.owner}/{repo.name}</DocsTitle>
        <DocsDescription>Open a document from the sidebar or start with the first indexed Markdown file.</DocsDescription>
        <DocsBody>
          <div className="not-prose">
            <Link href={hrefForDoc(repoId, first.path)} className="rounded-md bg-fd-primary px-3 py-2 text-sm font-medium text-fd-primary-foreground">
              Open {first.title}
            </Link>
          </div>
        </DocsBody>
      </DocsPage>
    );
  }

  const repoPath = relativePathFromSlug(pathSlug);
  const document = getDocument(repoId, repoPath);
  if (!document) notFound();

  const file = await readDocumentFile(repoId, repoPath);
  const rendered = await renderMarkdown(repoId, repoPath, file.raw);

  return (
    <DocsPage toc={rendered.toc}>
      <DocsTitle>{rendered.title}</DocsTitle>
      <DocsDescription className="mb-0">{rendered.description || `${repo.owner}/${repo.name} · ${repoPath}`}</DocsDescription>
      <div className="not-prose flex flex-wrap gap-2 border-b pb-6 text-sm">
        <Link href={`/admin/repos/${encodeURIComponent(repoId)}/edit?path=${encodeURIComponent(repoPath)}`} className="rounded-md border px-3 py-2 hover:bg-fd-accent">
          Edit
        </Link>
        <a
          href={`https://github.com/${repo.owner}/${repo.name}/blob/${repo.default_branch}/${repoPath.split('/').map(encodeURIComponent).join('/')}`}
          className="rounded-md border px-3 py-2 hover:bg-fd-accent"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
      </div>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <DocsBody>
          <div dangerouslySetInnerHTML={{ __html: rendered.html }} />
        </DocsBody>
        <NotePanel repoId={repoId} branch={repo.default_branch} path={repoPath} />
      </div>
    </DocsPage>
  );
}

export async function generateMetadata(props: PageProps<'/docs/[[...slug]]'>): Promise<Metadata> {
  const params = await props.params;
  const [repoId, ...pathSlug] = params.slug ?? [];

  if (!repoId || pathSlug.length === 0) {
    return { title: 'Repositories' };
  }

  const repoPath = relativePathFromSlug(pathSlug);
  const document = getDocument(repoId, repoPath);
  if (!document) return { title: 'Document' };

  return {
    title: document.title,
    description: document.description ?? undefined,
  };
}
