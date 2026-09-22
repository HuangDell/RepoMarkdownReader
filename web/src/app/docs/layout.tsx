import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { buildPageTree } from '@/lib/server/repositories';
import { ensureSyncScheduler } from '@/lib/server/scheduler';
import { ReaderSidebarFolder } from '@/components/reader/sidebar-folder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Layout({ children }: LayoutProps<'/docs'>) {
  ensureSyncScheduler();

  return <DocsLayout tree={buildPageTree()} sidebar={{ components: { Folder: ReaderSidebarFolder } }} {...baseOptions()}>{children}</DocsLayout>;
}
