import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { SidebarProvider, SidebarTrigger, useSidebar } from 'fumadocs-ui/layouts/docs/slots/sidebar';
import { baseOptions } from '@/lib/layout.shared';
import { buildPageTree } from '@/lib/server/repositories';
import { ensureSyncScheduler } from '@/lib/server/scheduler';
import { ReaderSidebar } from '@/components/reader/explorer';
import { SidebarResizer, TocResizer } from '@/components/reader/sidebar-resizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function Layout({ children }: LayoutProps<'/docs'>) {
  ensureSyncScheduler();

  return <DocsLayout tree={buildPageTree()} slots={{ sidebar: { root: ReaderSidebar, provider: SidebarProvider, trigger: SidebarTrigger, useSidebar } }} {...baseOptions()}>{children}<SidebarResizer /><TocResizer /></DocsLayout>;
}
