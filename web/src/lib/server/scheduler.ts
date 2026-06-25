import 'server-only';
import { appConfig } from './config';
import { listRepositories, syncRepository } from './repositories';

const schedulerKey = Symbol.for('reader.syncScheduler');

type SchedulerState = {
  timer?: NodeJS.Timeout;
  running: boolean;
};

function getState() {
  const globalWithScheduler = globalThis as typeof globalThis & { [schedulerKey]?: SchedulerState };
  globalWithScheduler[schedulerKey] ??= { running: false };
  return globalWithScheduler[schedulerKey];
}

function syncDueRepositories() {
  const state = getState();
  if (state.running) return;

  state.running = true;
  void (async () => {
    try {
      const intervalMs = Math.max(appConfig.pullIntervalMinutes, 1) * 60 * 1000;
      const dueBefore = Date.now() - intervalMs;

      for (const repo of listRepositories()) {
        if (repo.status === 'cloning' || repo.status === 'syncing') continue;
        const lastSyncTime = repo.last_sync_at ? Date.parse(repo.last_sync_at) : 0;
        if (lastSyncTime > dueBefore) continue;

        await syncRepository(repo.id).catch(() => undefined);
      }
    } finally {
      state.running = false;
    }
  })();
}

export function ensureSyncScheduler() {
  if (process.env.NEXT_PHASE === 'phase-production-build') return;

  const state = getState();
  if (state.timer) return;

  const intervalMs = Math.max(appConfig.pullIntervalMinutes, 1) * 60 * 1000;
  state.timer = setInterval(syncDueRepositories, intervalMs);
  state.timer.unref?.();
}
