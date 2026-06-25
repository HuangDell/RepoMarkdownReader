import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { baseOptions } from '@/lib/layout.shared';
import { buildPageTree } from '@/lib/server/repositories';
import { ensureSyncScheduler } from '@/lib/server/scheduler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function Layout({ children }: LayoutProps<'/docs'>) {
  ensureSyncScheduler();

  return (
    <DocsLayout tree={buildPageTree()} {...baseOptions()}>
      {children}
    </DocsLayout>
  );
}
