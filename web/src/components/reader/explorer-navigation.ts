import type * as PageTree from 'fumadocs-core/page-tree';

export type ReaderFolder = PageTree.Folder & { repoId: string; folderPath: string };
export type Location = { repoId: string; folderPath: string } | null;

export function parentLocation(location: Location): Location {
  if (!location || !location.folderPath) return null;
  return { repoId: location.repoId, folderPath: location.folderPath.split('/').slice(0, -1).join('/') };
}

export function findFolder(tree: PageTree.Root, location: Location): ReaderFolder | undefined {
  if (!location) return;
  function visit(nodes: PageTree.Node[]): ReaderFolder | undefined {
    for (const node of nodes) {
      if (node.type !== 'folder') continue;
      const folder = node as ReaderFolder;
      if (folder.repoId === location!.repoId && folder.folderPath === location!.folderPath) return folder;
      const found = visit(folder.children);
      if (found) return found;
    }
  }
  return visit(tree.children);
}

export function validLocation(tree: PageTree.Root, location: Location): Location {
  while (location && !findFolder(tree, location)) location = parentLocation(location);
  return location;
}

export function documentLocation(tree: PageTree.Root, pathname: string): Location {
  function visit(nodes: PageTree.Node[]): Location {
    for (const node of nodes) {
      if (node.type !== 'folder') continue;
      const folder = node as ReaderFolder;
      if (folder.index?.url === pathname || folder.children.some((child) => child.type === 'page' && child.url === pathname)) {
        return { repoId: folder.repoId, folderPath: folder.folderPath };
      }
      const found = visit(folder.children);
      if (found) return found;
    }
    return null;
  }
  return visit(tree.children);
}
