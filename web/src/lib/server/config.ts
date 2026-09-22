import 'server-only';
import path from 'node:path';

export const appConfig = {
  dataDir: path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.READER_DATA_DIR ?? '../data'),
  githubToken: process.env.READER_GITHUB_TOKEN ?? '',
  pullIntervalMinutes: Number.parseInt(process.env.READER_PULL_INTERVAL_MINUTES ?? '15', 10),
};

export function assertGitCredentialsConfigured() {
  if (!appConfig.githubToken) {
    throw new Error('Set READER_GITHUB_TOKEN before adding private repositories or pushing changes.');
  }
}
