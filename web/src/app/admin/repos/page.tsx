import { redirect } from 'next/navigation';
import { RepoManager } from '@/components/admin/repo-manager';
import { isAdminSession } from '@/lib/server/auth';
import { getAuthConfigStatus } from '@/lib/server/config';
import { listRepositories } from '@/lib/server/repositories';
import { ensureSyncScheduler } from '@/lib/server/scheduler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function RepositoriesAdminPage() {
  if (!(await isAdminSession())) redirect('/login?redirectTo=/admin/repos');

  ensureSyncScheduler();

  const status = getAuthConfigStatus();
  return <RepoManager initialRepositories={listRepositories()} hasGithubToken={status.hasGithubToken} />;
}
