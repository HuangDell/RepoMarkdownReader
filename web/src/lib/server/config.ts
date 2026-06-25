import 'server-only';
import path from 'node:path';

export const appConfig = {
  dataDir: path.resolve(/* turbopackIgnore: true */ process.cwd(), process.env.READER_DATA_DIR ?? '../data'),
  adminPassword: process.env.READER_ADMIN_PASSWORD ?? '',
  sessionSecret: process.env.READER_SESSION_SECRET ?? '',
  githubToken: process.env.READER_GITHUB_TOKEN ?? '',
  pullIntervalMinutes: Number.parseInt(process.env.READER_PULL_INTERVAL_MINUTES ?? '15', 10),
};

export function getAuthConfigStatus() {
  return {
    hasAdminPassword: appConfig.adminPassword.length > 0,
    hasSessionSecret: appConfig.sessionSecret.length >= 32,
    hasGithubToken: appConfig.githubToken.length > 0,
  };
}

export function assertAdminAuthConfigured() {
  const status = getAuthConfigStatus();

  if (!status.hasAdminPassword || !status.hasSessionSecret) {
    throw new Error('Set READER_ADMIN_PASSWORD and a 32+ character READER_SESSION_SECRET before using admin APIs.');
  }
}

export function assertGitCredentialsConfigured() {
  if (!appConfig.githubToken) {
    throw new Error('Set READER_GITHUB_TOKEN before adding private repositories or pushing changes.');
  }
}
