import { Env } from '../types';
import { verifyHttpSignature } from '../crypto/http-signature';
import { sendActivity } from './delivery';
import { ulid } from '../utils/ulid';
import { acceptedResponse, unauthorizedResponse, badRequestResponse, errorResponse } from '../utils/response';

interface Activity {
  id?: string;
  type: string;
  actor: string;
  object?: string | { id?: string; type?: string };
}

interface Actor {
  inbox: string;
  endpoints?: { sharedInbox?: string };
  sharedInbox?: string;
}

export async function handleInbox(
  handle: string,
  request: Request,
  env: Env
): Promise<Response> {
  // HTTP Signature verification (with actor cache)
  const verification = await verifyHttpSignature(request, env.DB);
  if (!verification.valid) {
    console.error('Signature verification failed:', verification.error);
    return unauthorizedResponse('Unauthorized: ' + verification.error);
  }

  const activity = await request.json() as Activity;
  console.log(`[${handle}] Received:`, activity.type, 'from', activity.actor);

  try {
    switch (activity.type) {
      case 'Follow':
        return handleFollow(handle, activity, env);
      case 'Undo':
        return handleUndo(handle, activity, env);
      case 'Create':
        return handleCreate(handle, activity, env);
      case 'Update':
        return handleUpdate(handle, activity, env);
      case 'Delete':
        return handleDelete(handle, activity, env);
      case 'Like':
        return handleLike(handle, activity, env);
      case 'Announce':
        return handleAnnounce(handle, activity, env);
      case 'Accept':
        return handleAccept(handle, activity, env);
      case 'Reject':
        return handleReject(handle, activity, env);
      default:
        console.log(`[${handle}] Unknown activity type:`, activity.type);
        return acceptedResponse();
    }
  } catch (error) {
    console.error(`[${handle}] Inbox error:`, error);
    return errorResponse('Internal Server Error');
  }
}

async function handleFollow(handle: string, activity: Activity, env: Env): Promise<Response> {
  const actorUrl = activity.actor;

  // Fetch Actor information
  const actorResponse = await fetch(actorUrl, {
    headers: { 'Accept': 'application/activity+json, application/ld+json' },
  });

  if (!actorResponse.ok) {
    return badRequestResponse();
  }

  const actor = await actorResponse.json() as Actor;
  const inboxUrl = actor.inbox;
  const sharedInboxUrl = actor.endpoints?.sharedInbox || actor.sharedInbox;

  // Add to followers
  await env.DB.prepare(`
    INSERT OR REPLACE INTO followers
    (handle, actor_url, inbox_url, shared_inbox_url, actor_json, followed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    handle,
    actorUrl,
    inboxUrl,
    sharedInboxUrl || null,
    JSON.stringify(actor),
    new Date().toISOString()
  ).run();

  // Record received activity
  await recordActivity(handle, 'Follow', activity, env);

  // Send Accept
  const acceptActivity = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `https://${env.DOMAIN}/users/${handle}/activities/${ulid()}`,
    type: 'Accept',
    actor: `https://${env.DOMAIN}/users/${handle}`,
    object: activity,
  };

  await sendActivity(handle, acceptActivity, inboxUrl, env);

  return acceptedResponse();
}

async function handleUndo(handle: string, activity: Activity, env: Env): Promise<Response> {
  const object = activity.object;
  const objectType = typeof object === 'string' ? null : object?.type;

  if (objectType === 'Follow') {
    await env.DB.prepare(
      'DELETE FROM followers WHERE handle = ? AND actor_url = ?'
    ).bind(handle, activity.actor).run();
  } else if (objectType === 'Like' || objectType === 'Announce') {
    const objectId = typeof object === 'string' ? object : object?.id;
    if (objectId) {
      await env.DB.prepare(
        'DELETE FROM inbox_activities WHERE id = ?'
      ).bind(objectId).run();
    }
  }

  return acceptedResponse();
}

async function handleCreate(handle: string, activity: Activity, env: Env): Promise<Response> {
  const object = activity.object;
  const objectType = typeof object === 'string' ? null : object?.type;
  if (objectType === 'Note') {
    await recordActivity(handle, 'Create', activity, env);
  }
  return acceptedResponse();
}

async function handleUpdate(handle: string, activity: Activity, env: Env): Promise<Response> {
  const object = activity.object;
  const objectType = typeof object === 'string' ? null : object?.type;
  if (objectType === 'Person') {
    await env.DB.prepare(`
      UPDATE followers SET actor_json = ? WHERE handle = ? AND actor_url = ?
    `).bind(JSON.stringify(activity.object), handle, activity.actor).run();
  }
  return acceptedResponse();
}

async function handleDelete(handle: string, activity: Activity, env: Env): Promise<Response> {
  const objectUrl = typeof activity.object === 'string'
    ? activity.object
    : activity.object?.id;

  if (objectUrl) {
    await env.DB.prepare(
      'DELETE FROM inbox_activities WHERE handle = ? AND object_url = ?'
    ).bind(handle, objectUrl).run();
  }
  return acceptedResponse();
}

async function handleLike(handle: string, activity: Activity, env: Env): Promise<Response> {
  await recordActivity(handle, 'Like', activity, env);
  return acceptedResponse();
}

async function handleAnnounce(handle: string, activity: Activity, env: Env): Promise<Response> {
  await recordActivity(handle, 'Announce', activity, env);
  return acceptedResponse();
}

async function handleAccept(handle: string, activity: Activity, env: Env): Promise<Response> {
  const object = activity.object;
  const objectType = typeof object === 'string' ? null : object?.type;
  if (objectType === 'Follow' || typeof object === 'string') {
    await env.DB.prepare(`
      UPDATE following SET accepted = 1, accepted_at = ?
      WHERE handle = ? AND actor_url = ?
    `).bind(new Date().toISOString(), handle, activity.actor).run();
  }
  return acceptedResponse();
}

async function handleReject(handle: string, activity: Activity, env: Env): Promise<Response> {
  await env.DB.prepare(
    'DELETE FROM following WHERE handle = ? AND actor_url = ?'
  ).bind(handle, activity.actor).run();
  return acceptedResponse();
}

async function recordActivity(handle: string, type: string, activity: Activity, env: Env): Promise<void> {
  const objectUrl = typeof activity.object === 'string'
    ? activity.object
    : activity.object?.id;

  await env.DB.prepare(`
    INSERT OR IGNORE INTO inbox_activities
    (id, handle, type, actor_url, object_url, object_json, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    activity.id || ulid(),
    handle,
    type,
    activity.actor,
    objectUrl || null,
    activity.object ? JSON.stringify(activity.object) : null,
    new Date().toISOString()
  ).run();
}
