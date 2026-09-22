import { RepoManager } from '@/components/repo-manager';
import { appConfig } from '@/lib/server/config';
import { listRepositories } from '@/lib/server/repositories';
import { ensureSyncScheduler } from '@/lib/server/scheduler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function RepositoriesPage() {
  ensureSyncScheduler();

  return <RepoManager initialRepositories={listRepositories()} hasGithubToken={Boolean(appConfig.githubToken)} />;
}
