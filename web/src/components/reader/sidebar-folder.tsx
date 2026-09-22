'use client';

import type * as PageTree from 'fumadocs-core/page-tree';
import { usePathname } from 'fumadocs-core/framework';
import { useTreePath } from 'fumadocs-ui/contexts/tree';
import {
  SidebarFolder,
  SidebarFolderContent,
  SidebarFolderLink,
  SidebarFolderTrigger,
} from 'fumadocs-ui/components/sidebar/base';
import { FolderPlus, LoaderCircle, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type ReaderFolder = PageTree.Folder & {
  repoId: string;
  folderPath: string;
  canManage: boolean;
};

function isActiveUrl(url: string, pathname: string) {
  return pathname === url || pathname.startsWith(`${url}/`);
}

function stopPropagation(event: React.MouseEvent | React.KeyboardEvent) {
  event.stopPropagation();
}

export function ReaderSidebarFolder({ item, children }: { item: PageTree.Folder; children: React.ReactNode }) {
  const folder = item as ReaderFolder;
  const pathname = usePathname();
  const treePath = useTreePath();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [message, setMessage] = useState('');

  const active = treePath.includes(item);
  const canManage = folder.canManage === true;

  async function uploadFiles(files: File[]) {
    if (!files.length || !canManage) return;

    setIsBusy(true);
    setMessage('');
    try {
      const formData = new FormData();
      formData.set('folder', folder.folderPath);
      files.forEach((file) => formData.append('files', file));

      const response = await fetch(`/api/repos/${encodeURIComponent(folder.repoId)}/uploads`, {
        method: 'POST',
        body: formData,
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Upload failed.');

      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      setIsBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  async function createFolder(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!folderName.trim() || !canManage) return;

    setIsBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/repos/${encodeURIComponent(folder.repoId)}/folders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parentPath: folder.folderPath, name: folderName }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Failed to create folder.');

      setFolderName('');
      setShowCreateForm(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create folder.');
    } finally {
      setIsBusy(false);
    }
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!canManage || !event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    if (!canManage) return;
    event.preventDefault();
    setIsDragging(false);
    void uploadFiles(Array.from(event.dataTransfer.files));
  }

  const controls = canManage ? (
    <div className="flex shrink-0 items-center gap-0.5" onClick={stopPropagation} onKeyDown={stopPropagation}>
      <input
        ref={inputRef}
        type="file"
        accept=".md,.markdown,.mdx"
        multiple
        className="sr-only"
        onChange={(event) => void uploadFiles(Array.from(event.target.files ?? []))}
      />
      <button
        type="button"
        title="Upload Markdown files"
        aria-label={`Upload Markdown files to ${String(folder.name)}`}
        disabled={isBusy}
        onClick={() => inputRef.current?.click()}
        className="inline-flex size-7 items-center justify-center rounded-md text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground disabled:opacity-50"
      >
        {isBusy ? <LoaderCircle className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
      </button>
      <button
        type="button"
        title="Create subfolder"
        aria-label={`Create a subfolder in ${String(folder.name)}`}
        disabled={isBusy}
        onClick={() => setShowCreateForm((value) => !value)}
        className="inline-flex size-7 items-center justify-center rounded-md text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground disabled:opacity-50"
      >
        <FolderPlus className="size-3.5" />
      </button>
    </div>
  ) : null;

  const title = folder.index ? (
    <SidebarFolderLink
      href={folder.index.url}
      active={isActiveUrl(folder.index.url, pathname)}
      className="min-w-0 flex-1"
      onClick={(event) => {
        if (event.target instanceof Element && event.target.closest('button')) event.preventDefault();
      }}
    >
      {folder.icon}
      <span className="min-w-0 truncate">{folder.name}</span>
    </SidebarFolderLink>
  ) : (
    <SidebarFolderTrigger className="min-w-0 flex-1">
      {folder.icon}
      <span className="min-w-0 truncate">{folder.name}</span>
    </SidebarFolderTrigger>
  );

  return (
    <div
      className={isDragging ? 'rounded-lg bg-fd-primary/10 ring-1 ring-fd-primary/50' : undefined}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <SidebarFolder collapsible={folder.collapsible} active={active} defaultOpen={folder.defaultOpen}>
        <div className="flex items-center gap-1">
          {title}
          {controls}
        </div>
        {showCreateForm ? (
          <form className="my-1 flex items-center gap-1 px-2" onSubmit={createFolder}>
            <input
              autoFocus
              value={folderName}
              onChange={(event) => setFolderName(event.target.value)}
              placeholder="Folder name"
              aria-label="New folder name"
              disabled={isBusy}
              className="min-w-0 flex-1 rounded-md border bg-transparent px-2 py-1 text-xs outline-none focus:border-fd-primary"
            />
            <button
              type="submit"
              disabled={isBusy || !folderName.trim()}
              className="rounded-md bg-fd-primary px-2 py-1 text-xs font-medium text-fd-primary-foreground disabled:opacity-50"
            >
              Add
            </button>
          </form>
        ) : null}
        {message ? <p className="px-2 py-1 text-xs text-red-600 dark:text-red-300" role="status">{message}</p> : null}
        <SidebarFolderContent>{children}</SidebarFolderContent>
      </SidebarFolder>
    </div>
  );
}
