import { Env } from './types';
import { Router } from './router';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const router = new Router(env, ctx);
    return router.handle(request);
  },

  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Process delivery queue on scheduled events
    const { processDeliveryQueue } = await import('./activitypub/delivery');
    const processed = await processDeliveryQueue(env);
    console.log(`Scheduled: processed ${processed} delivery queue items`);
  },
};
