import { Env } from '../types';
import { syncToGitHub } from './sync';

// Debounce sync to avoid too many GitHub API calls
const SYNC_DELAY_MS = 5000;
let pendingSync: Promise<void> | null = null;

export function queueBackgroundSync(ctx: ExecutionContext, env: Env): void {
  // Use waitUntil to run sync after response is sent
  ctx.waitUntil(
    (async () => {
      // Simple delay to batch multiple operations
      await new Promise(resolve => setTimeout(resolve, SYNC_DELAY_MS));

      try {
        const result = await syncToGitHub(env);
        console.log(`Background sync completed: ${result.synced} items`);
      } catch (error) {
        console.error('Background sync error:', error);
      }
    })()
  );
}
