'use client';

import { useState, useRef, useCallback, type DragEvent } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTreeContext } from 'fumadocs-ui/contexts/tree';
import { useDocsLayout } from 'fumadocs-ui/layouts/docs';
import type { SidebarProps } from 'fumadocs-ui/layouts/docs/slots/sidebar';
import Link from 'next/link';
import { SidebarContent, SidebarCollapseTrigger, SidebarDrawerContent, SidebarDrawerOverlay, SidebarItem, SidebarViewport, useSidebar } from 'fumadocs-ui/components/sidebar/base';
import { ArrowLeft, ChevronRight, FolderPlus, PanelLeft, Pencil, Upload, X } from 'lucide-react';
import { documentLocation, findFolder, parentLocation, validLocation, type Location, type ReaderFolder } from './explorer-navigation';

type Edit = { kind: 'create' | 'rename'; folder: ReaderFolder; name: string };

export function ReaderSidebar({ banner, footer, collapsible = true }: SidebarProps) {
  const { full: tree } = useTreeContext();
  const pathname = usePathname();
  const router = useRouter();
  const { slots, menuItems } = useDocsLayout();
  const { setOpen } = useSidebar();
  const [navigation, setNavigation] = useState(() => ({ pathname, location: documentLocation(tree, pathname) }));
  const [edit, setEdit] = useState<Edit | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [dragPath, setDragPath] = useState<string | null>(null);
  const [pendingRename, setPendingRename] = useState<Location>(null);
  const uploadInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<ReaderFolder | null>(null);
  const submitting = useRef(false);
  const location = validLocation(tree, navigation.location);
  const folder = findFolder(tree, location);
  const entries = folder
    ? [...folder.children, ...(folder.index ? [folder.index] : [])].sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
        return String(a.name).localeCompare(String(b.name));
      })
    : tree.children;

  // Route changes locate the document; refreshes preserve directory browsing.
  if (navigation.pathname !== pathname) {
    setNavigation({ pathname, location: documentLocation(tree, pathname) });
    setEdit(null);
    setMessage('');
    setPendingRename(null);
  } else if (location?.repoId !== navigation.location?.repoId || location?.folderPath !== navigation.location?.folderPath) {
    setNavigation({ pathname, location });
  }

  function navigate(next: Location) {
    if (edit || busy) return;
    setNavigation({ pathname, location: next });
    setMessage('');
    setDragPath(null);
  }

  const upload = useCallback(async (target: ReaderFolder, files: File[]) => {
    if (!files.length || submitting.current || edit) return;
    submitting.current = true;
    setBusy(true);
    setMessage('');
    try {
      const body = new FormData();
      body.set('folder', target.folderPath);
      files.forEach((file) => body.append('files', file));
      const response = await fetch(`/api/repos/${encodeURIComponent(target.repoId)}/uploads`, { method: 'POST', body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Upload failed.');
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed.');
    } finally {
      submitting.current = false;
      setBusy(false);
      if (uploadInput.current) uploadInput.current.value = '';
    }
  }, [edit, router]);

  const chooseUpload = useCallback((target: ReaderFolder) => {
    uploadTarget.current = target;
    uploadInput.current?.click();
  }, []);

  async function submitEdit() {
    if (!edit || !edit.name.trim() || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage('');
    try {
      const response = await fetch(`/api/repos/${encodeURIComponent(edit.folder.repoId)}/folders`, {
        method: edit.kind === 'create' ? 'POST' : 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(edit.kind === 'create'
          ? { parentPath: edit.folder.folderPath, name: edit.name }
          : { path: edit.folder.folderPath, name: edit.name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Folder operation failed.');
      // Keep the renamed path pending until the refreshed tree contains it.
      if (edit.kind === 'rename' && data.folder?.path && location?.repoId === edit.folder.repoId && location.folderPath === edit.folder.folderPath) {
        setPendingRename({ repoId: edit.folder.repoId, folderPath: data.folder.path });
      }
      setEdit(null);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Folder operation failed.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (navigation.pathname === pathname && pendingRename && findFolder(tree, pendingRename)) {
    setPendingRename(null);
    setNavigation({ pathname, location: pendingRename });
  }

  function dropHandlers(target: ReaderFolder) {
    const key = `${target.repoId}:${target.folderPath}`;
    return {
      onDragOver(event: DragEvent) {
        if (!event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.stopPropagation();
        if (busy || edit) return;
        event.dataTransfer.dropEffect = 'copy';
        setDragPath(key);
      },
      onDragLeave(event: DragEvent) {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragPath(null);
      },
      onDrop(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();
        setDragPath(null);
        void upload(target, Array.from(event.dataTransfer.files));
      },
      'data-dragging': dragPath === key,
    };
  }

  function controls(target: ReaderFolder, current = false) {
    return <div className="reader-explorer-controls">
      <button type="button" disabled={busy || !!edit} aria-label={`Upload Markdown files to ${String(target.name)}`} title="Upload Markdown files" onClick={() => chooseUpload(target)}><Upload /></button>
      {current && <button type="button" disabled={busy || !!edit} aria-label="Create subfolder in current directory" title="Create subfolder" onClick={() => { setMessage(''); setEdit({ kind: 'create', folder: target, name: '' }); }}><FolderPlus /></button>}
      {target.folderPath && <button type="button" disabled={busy || !!edit} aria-label={`Rename ${String(target.name)}`} title="Rename folder" onClick={() => { setMessage(''); setEdit({ kind: 'rename', folder: target, name: String(target.name) }); }}><Pencil /></button>}
    </div>;
  }

  const content = <>
    <div className="flex flex-col gap-3 p-3">
      <div className="flex items-center gap-2"><slots.navTitle className="min-w-0 flex-1 text-sm font-medium" />
        {collapsible && <SidebarCollapseTrigger className="hidden p-1 md:block" aria-label="Toggle Explorer"><PanelLeft className="size-4" /></SidebarCollapseTrigger>}
        <button type="button" className="p-1 md:hidden" aria-label="Close Explorer" onClick={() => setOpen(false)}><X className="size-4" /></button>
      </div>
      {slots.searchTrigger && <slots.searchTrigger.full hideIfDisabled />}
      {banner}
    </div>
    <SidebarViewport>
      {menuItems.filter((item) => item.type !== 'icon' && 'url' in item).map((item, index) => 'url' in item && item.url && <Link key={index} href={item.url} className="p-2">{item.icon}{item.text}</Link>)}
      <nav aria-label="Explorer" className="reader-explorer" {...(folder ? dropHandlers(folder) : {})}>
        <div className="reader-explorer-heading">
          {location && <button type="button" disabled={busy || !!edit} onClick={() => navigate(parentLocation(location))} aria-label="Back to parent directory" title="返回上一级"><ArrowLeft className="size-4" /></button>}
          <span className="min-w-0 flex-1 truncate font-medium">{folder ? folder.name : 'Repositories'}</span>
          {folder && controls(folder, true)}
        </div>
        {folder && <p className="truncate px-2 pb-2 text-xs text-fd-muted-foreground" title={`${String(tree.children.find((node) => node.type === 'folder' && (node as ReaderFolder).repoId === folder.repoId)?.name)}/${folder.folderPath}`}>{folder.folderPath || '/'}</p>}
        {message && <p role="alert" className="p-2 text-xs text-red-600 dark:text-red-300">{message}</p>}
        {busy && <p role="status" className="px-2 text-xs text-fd-muted-foreground">Saving…</p>}
        {edit && <form className="flex gap-1 p-1" onSubmit={(event) => { event.preventDefault(); void submitEdit(); }}>
          <input autoFocus className="reader-sidebar-folder-inline-input" aria-label={edit.kind === 'create' ? 'New folder name' : 'Rename folder'} placeholder="Folder name" value={edit.name} disabled={busy} onChange={(event) => setEdit({ ...edit, name: event.target.value })} onKeyDown={(event) => { if (event.key === 'Escape' && !busy) setEdit(null); }} />
          <button type="submit" disabled={busy || !edit.name.trim()} className="px-1 text-xs">Save</button>
          <button type="button" disabled={busy} aria-label="Cancel folder edit" onClick={() => setEdit(null)}><X className="size-4" /></button>
        </form>}
        {entries.map((node, index) => {
          if (node.type === 'separator') return <p key={index}>{node.name}</p>;
          if (node.type === 'page') return <SidebarItem key={node.url} href={node.url} icon={node.icon} active={pathname === node.url} className="reader-explorer-item" onClick={() => setOpen(false)}>{node.name}</SidebarItem>;
          const child = node as ReaderFolder;
          return <div key={`${child.repoId}:${child.folderPath}`} className="reader-explorer-row" {...dropHandlers(child)}>
            <button type="button" className="reader-explorer-item min-w-0 flex-1" disabled={busy || !!edit} onClick={() => navigate({ repoId: child.repoId, folderPath: child.folderPath })}>
              {child.icon}<span className="min-w-0 flex-1 truncate">{child.name}</span><ChevronRight className="size-3.5" />
            </button>{controls(child)}
          </div>;
        })}
        {!entries.length && <p className="p-2 text-sm text-fd-muted-foreground">{folder ? 'This folder is empty.' : 'No repositories yet.'}</p>}
      </nav>
    </SidebarViewport>
    <div className="flex items-center gap-2 border-t p-2">
      {menuItems.filter((item) => item.type === 'icon').map((item, index) => 'url' in item && <Link key={index} href={item.url} aria-label={item.label} className="p-1 [&_svg]:size-4">{item.icon}</Link>)}
      {slots.themeSwitch && <slots.themeSwitch className="ms-auto" />}{footer}
    </div>
  </>;

  return <>
    <input ref={uploadInput} type="file" accept=".md,.markdown,.mdx" multiple className="sr-only" onChange={(event) => { if (uploadTarget.current) void upload(uploadTarget.current, Array.from(event.target.files ?? [])); }} />
    <SidebarContent>{({ ref, collapsed, hovered, ...events }) => <>
      <div data-sidebar-placeholder="" className="sticky top-(--fd-docs-row-1) z-20 [grid-area:sidebar] h-[calc(var(--fd-docs-height)-var(--fd-docs-row-1))] md:layout:[--fd-sidebar-width:268px] max-md:hidden">
        <aside ref={ref} id="nd-sidebar" data-collapsed={collapsed} data-hovered={collapsed && hovered} {...events} className={`reader-explorer-shell absolute inset-y-0 start-0 flex w-(--fd-sidebar-width) flex-col border-e bg-fd-card text-sm ${collapsed ? (hovered ? 'translate-x-0 shadow-lg' : '-translate-x-full') : ''}`}>{content}</aside>
        {collapsed && <div className="absolute inset-y-0 start-0 w-3" {...events} />}
      </div>
      {collapsed && <SidebarCollapseTrigger className="fixed start-2 top-2 z-30 rounded border bg-fd-card p-2" aria-label="Expand Explorer"><PanelLeft className="size-4" /></SidebarCollapseTrigger>}
    </>}</SidebarContent>
    <SidebarDrawerOverlay className="fixed inset-0 z-40 bg-black/20 backdrop-blur-xs" />
    <SidebarDrawerContent className="reader-explorer-shell fixed inset-y-0 end-0 z-40 flex w-[85%] max-w-[380px] flex-col border-s bg-fd-background shadow-lg">{content}</SidebarDrawerContent>
  </>;
}
