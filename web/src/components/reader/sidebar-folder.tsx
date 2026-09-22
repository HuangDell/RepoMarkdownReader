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
import { ChevronDown, FolderPlus, LoaderCircle, Pencil, Upload } from 'lucide-react';
import { createContext, useContext, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

type ReaderFolder = PageTree.Folder & {
  repoId: string;
  folderPath: string;
};

interface ReaderSidebarFolderContextValue {
  selectedPath: string;
  selectFolder: (folderPath: string) => void;
  updateFolderPath: (fromPath: string, toPath: string) => void;
  beginCreateFolder: () => void;
  createParentPath: string | null;
  createName: string;
  setCreateName: (name: string) => void;
  submitCreateFolder: () => void;
  cancelCreateFolder: () => void;
}

const ReaderSidebarFolderContext = createContext<ReaderSidebarFolderContextValue | null>(null);

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
  const inheritedContext = useContext(ReaderSidebarFolderContext);
  const isRepositoryFolder = folder.folderPath === '';
  const [selectedPath, setSelectedPath] = useState('');
  const [createParentPath, setCreateParentPath] = useState<string | null>(null);
  const [createName, setCreateName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameName, setRenameName] = useState(String(folder.name));
  const [message, setMessage] = useState('');
  const createSubmittingRef = useRef(false);
  const renameSubmittingRef = useRef(false);

  const active = treePath.includes(item);
  const context = isRepositoryFolder
    ? {
        selectedPath,
        selectFolder: setSelectedPath,
        updateFolderPath: (fromPath: string, toPath: string) => {
          setSelectedPath((current) => {
            if (current === fromPath) return toPath;
            if (current.startsWith(`${fromPath}/`)) return `${toPath}${current.slice(fromPath.length)}`;
            return current;
          });
        },
        beginCreateFolder: () => {
          setCreateParentPath(selectedPath);
          setCreateName('');
          setMessage('');
        },
        createParentPath,
        createName,
        setCreateName,
        submitCreateFolder: () => void createFolder(),
        cancelCreateFolder,
      }
    : inheritedContext;

  const currentSelectedPath = isRepositoryFolder ? selectedPath : inheritedContext?.selectedPath;
  const pendingCreatePath = isRepositoryFolder ? createParentPath : inheritedContext?.createParentPath;
  const folderContext = context as ReaderSidebarFolderContextValue;
  const selected = currentSelectedPath === folder.folderPath;

  async function uploadFiles(files: File[]) {
    if (!files.length) return;

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

  async function createFolder() {
    if (createParentPath === null || !createName.trim() || createSubmittingRef.current) return;

    createSubmittingRef.current = true;
    setIsBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/repos/${encodeURIComponent(folder.repoId)}/folders`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ parentPath: createParentPath, name: createName }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Failed to create folder.');

      setCreateName('');
      setCreateParentPath(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to create folder.');
    } finally {
      createSubmittingRef.current = false;
      setIsBusy(false);
    }
  }

  function cancelCreateFolder() {
    setCreateName('');
    setCreateParentPath(null);
  }

  async function renameFolder() {
    const nextName = renameName.trim();
    if (!nextName || isRepositoryFolder || renameSubmittingRef.current) return;

    renameSubmittingRef.current = true;
    setIsBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/repos/${encodeURIComponent(folder.repoId)}/folders`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: folder.folderPath, name: nextName }),
      });
      const data = (await response.json()) as { folder?: { path?: string }; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Failed to rename folder.');

      const nextPath = data.folder?.path;
      if (nextPath) context?.updateFolderPath(folder.folderPath, nextPath);
      setIsRenaming(false);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Failed to rename folder.');
    } finally {
      renameSubmittingRef.current = false;
      setIsBusy(false);
    }
  }

  function cancelRename() {
    setRenameName(String(folder.name));
    setIsRenaming(false);
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragging(true);
  }

  function handleDragLeave(event: React.DragEvent<HTMLDivElement>) {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsDragging(false);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setIsDragging(false);
    void uploadFiles(Array.from(event.dataTransfer.files));
  }

  const controls = (
    <div className="reader-sidebar-folder-controls" onClick={stopPropagation} onKeyDown={stopPropagation}>
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
      {isRepositoryFolder ? (
        <button
          type="button"
          title="Create subfolder in selected folder"
          aria-label="Create a subfolder in the selected folder"
          disabled={isBusy || createParentPath !== null}
          onClick={() => context?.beginCreateFolder()}
          className="inline-flex size-7 items-center justify-center rounded-md text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground disabled:opacity-50"
        >
          <FolderPlus className="size-3.5" />
        </button>
      ) : (
        <button
          type="button"
          title="Rename folder"
          aria-label={`Rename ${String(folder.name)}`}
          disabled={isBusy}
          onClick={() => {
            setRenameName(String(folder.name));
            setIsRenaming(true);
          }}
          className="inline-flex size-7 items-center justify-center rounded-md text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground disabled:opacity-50"
        >
          <Pencil className="size-3.5" />
        </button>
      )}
    </div>
  );

  const title = isRenaming ? (
    <div className="reader-sidebar-folder-trigger reader-sidebar-folder-editing" onClick={stopPropagation}>
      <ChevronDown data-icon="true" className="size-4 shrink-0" />
      <span className="reader-sidebar-folder-icon">{folder.icon}</span>
      <input
        autoFocus
        value={renameName}
        onChange={(event) => setRenameName(event.target.value)}
        onBlur={(event) => {
          if (event.currentTarget.form?.contains(event.relatedTarget as Node | null)) return;
          if (renameName.trim()) void renameFolder();
          else cancelRename();
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            void renameFolder();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            cancelRename();
          }
        }}
        aria-label={`Rename ${String(folder.name)}`}
        disabled={isBusy}
        className="reader-sidebar-folder-inline-input min-w-0 flex-1"
      />
    </div>
  ) : folder.index ? (
    <SidebarFolderLink
      href={folder.index.url}
      active={isActiveUrl(folder.index.url, pathname)}
      className={`reader-sidebar-folder-link${selected ? ' reader-sidebar-folder-selected' : ''}`}
      onPointerDown={() => context?.selectFolder(folder.folderPath)}
    >
      <span className="reader-sidebar-folder-icon">{folder.icon}</span>
      <span className="min-w-0 truncate">{folder.name}</span>
    </SidebarFolderLink>
  ) : (
    <SidebarFolderTrigger
      className={`reader-sidebar-folder-trigger${selected ? ' reader-sidebar-folder-selected' : ''}`}
      onPointerDown={() => context?.selectFolder(folder.folderPath)}
    >
      <span className="reader-sidebar-folder-icon">{folder.icon}</span>
      <span className="min-w-0 truncate">{folder.name}</span>
    </SidebarFolderTrigger>
  );

  const content = (
    <div
      className={isDragging ? 'rounded-lg bg-fd-primary/10 ring-1 ring-fd-primary/50' : undefined}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <SidebarFolder
        collapsible={folder.collapsible}
        active={active}
        defaultOpen={folder.defaultOpen || pendingCreatePath === folder.folderPath}
      >
        <div className="reader-sidebar-folder-row">
          {title}
          {controls}
        </div>
        {message ? <p className="px-2 py-1 text-xs text-red-600 dark:text-red-300" role="status">{message}</p> : null}
        <SidebarFolderContent className="reader-sidebar-folder-content">
          {pendingCreatePath === folder.folderPath ? (
            <form
              className="reader-sidebar-folder-pending-row"
              onSubmit={(event) => {
                event.preventDefault();
                folderContext.submitCreateFolder();
              }}
            >
              <span className="reader-sidebar-folder-pending-chevron" aria-hidden="true">
                <ChevronDown className="size-4 -rotate-90" />
              </span>
              <span className="reader-sidebar-folder-icon">{folder.icon}</span>
              <input
                autoFocus
                value={folderContext.createName}
                onChange={(event) => folderContext.setCreateName(event.target.value)}
                onBlur={(event) => {
                  if (event.currentTarget.form?.contains(event.relatedTarget as Node | null)) return;
                  if (folderContext.createName.trim()) folderContext.submitCreateFolder();
                  else folderContext.cancelCreateFolder();
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    folderContext.cancelCreateFolder();
                  }
                }}
                placeholder="Folder name"
                aria-label="New folder name"
                disabled={isBusy}
                className="reader-sidebar-folder-inline-input"
              />
            </form>
          ) : null}
          {children}
        </SidebarFolderContent>
      </SidebarFolder>
    </div>
  );

  if (isRepositoryFolder) {
    return <ReaderSidebarFolderContext.Provider value={context!}>{content}</ReaderSidebarFolderContext.Provider>;
  }

  return content;
}
