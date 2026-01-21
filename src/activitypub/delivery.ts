import { Env, getPrivateKey } from '../types';
import { signRequest } from '../crypto/http-signature';

export async function sendActivity(
  handle: string,
  activity: unknown,
  targetInbox: string,
  env: Env
): Promise<void> {
  const body = JSON.stringify(activity);
  const privateKey = getPrivateKey(env, handle);
  const keyId = `https://${env.DOMAIN}/users/${handle}#main-key`;

  const headers = await signRequest(targetInbox, 'POST', body, privateKey, keyId);

  try {
    const response = await fetch(targetInbox, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      console.error(`Delivery failed to ${targetInbox}: ${response.status}`);
      throw new Error(`Delivery failed: ${response.status}`);
    }

    console.log(`Delivered to ${targetInbox}`);
  } catch (error) {
    console.error(`Delivery error to ${targetInbox}:`, error);
    await queueDelivery(handle, activity, targetInbox, env);
  }
}

export async function broadcastToFollowers(handle: string, activity: unknown, env: Env): Promise<void> {
  const { results } = await env.DB.prepare(`
    SELECT DISTINCT COALESCE(shared_inbox_url, inbox_url) as inbox
    FROM followers WHERE handle = ?
  `).bind(handle).all();

  const inboxes = new Set((results || []).map(r => r.inbox as string));
  console.log(`Broadcasting to ${inboxes.size} inboxes`);

  for (const inbox of inboxes) {
    await sendActivity(handle, activity, inbox, env);
  }
}

async function queueDelivery(handle: string, activity: unknown, targetInbox: string, env: Env): Promise<void> {
  const nextAttempt = new Date(Date.now() + 60000).toISOString();

  await env.DB.prepare(`
    INSERT INTO delivery_queue
    (handle, activity_json, target_inbox, next_attempt_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(handle, JSON.stringify(activity), targetInbox, nextAttempt, new Date().toISOString()).run();
}

export async function processDeliveryQueue(env: Env): Promise<number> {
  const now = new Date().toISOString();
  const { results } = await env.DB.prepare(`
    SELECT * FROM delivery_queue
    WHERE next_attempt_at <= ? AND attempts < 10
    ORDER BY next_attempt_at
    LIMIT 50
  `).bind(now).all();

  if (!results || results.length === 0) {
    return 0;
  }

  let processed = 0;

  for (const item of results) {
    const handle = item.handle as string;
    const activity = JSON.parse(item.activity_json as string);
    const targetInbox = item.target_inbox as string;
    const attempts = (item.attempts as number) + 1;

    try {
      const privateKey = getPrivateKey(env, handle);
      const keyId = `https://${env.DOMAIN}/users/${handle}#main-key`;
      const body = JSON.stringify(activity);
      const headers = await signRequest(targetInbox, 'POST', body, privateKey, keyId);

      const response = await fetch(targetInbox, {
        method: 'POST',
        headers,
        body,
      });

      if (response.ok) {
        await env.DB.prepare('DELETE FROM delivery_queue WHERE id = ?').bind(item.id).run();
        processed++;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error) {
      const backoff = Math.min(60 * Math.pow(2, attempts), 86400) * 1000;
      const nextAttempt = new Date(Date.now() + backoff).toISOString();

      await env.DB.prepare(`
        UPDATE delivery_queue
        SET attempts = ?, next_attempt_at = ?, last_error = ?
        WHERE id = ?
      `).bind(attempts, nextAttempt, String(error), item.id).run();
    }
  }

  return processed;
}
