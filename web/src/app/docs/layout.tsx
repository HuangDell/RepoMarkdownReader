import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { buildPageTree } from '@/lib/server/repositories';
import { ensureSyncScheduler } from '@/lib/server/scheduler';
import { isAdminSession } from '@/lib/server/auth';
import { ReaderSidebarFolder } from '@/components/reader/sidebar-folder';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Layout({ children }: LayoutProps<'/docs'>) {
  ensureSyncScheduler();
  const canManage = await isAdminSession();

  return (
    <DocsLayout tree={buildPageTree(canManage)} sidebar={{ components: { Folder: ReaderSidebarFolder } }} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
