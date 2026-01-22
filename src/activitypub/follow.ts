import { Env } from '../types';
import { sendActivity } from './delivery';
import { ulid } from '../utils/ulid';
import { signGetRequest } from '../crypto/http-signature';

interface ActorInfo {
  id: string;
  inbox: string;
  sharedInbox?: string;
  preferredUsername: string;
  name?: string;
  icon?: string;
  publicKeyPem?: string;
}

interface SigningContext {
  privateKeyPem: string;
  keyId: string;
}

export async function resolveActor(
  actorId: string,
  signing?: SigningContext
): Promise<ActorInfo> {
  // If it's an acct: URI, resolve via WebFinger first
  if (actorId.startsWith('acct:') || actorId.includes('@') && !actorId.startsWith('http')) {
    const acct = actorId.replace('acct:', '');
    const [user, domain] = acct.split('@');

    const webfingerUrl = `https://${domain}/.well-known/webfinger?resource=acct:${user}@${domain}`;
    const wfResponse = await fetch(webfingerUrl, {
      headers: { 'Accept': 'application/jrd+json, application/json' },
    });

    if (!wfResponse.ok) {
      throw new Error(`WebFinger lookup failed: ${wfResponse.status}`);
    }

    const wfData = await wfResponse.json() as {
      links?: Array<{ rel: string; type?: string; href?: string }>;
    };

    const selfLink = wfData.links?.find(
      l => l.rel === 'self' && l.type?.includes('activity')
    );

    if (!selfLink?.href) {
      throw new Error('Could not find ActivityPub actor URL');
    }

    actorId = selfLink.href;
  }

  // Fetch the actor (with optional signing)
  let headers: Headers;
  if (signing) {
    headers = await signGetRequest(actorId, signing.privateKeyPem, signing.keyId);
  } else {
    headers = new Headers({
      'Accept': 'application/activity+json, application/ld+json',
      'User-Agent': 'ActivityPub-Server',
    });
  }

  const response = await fetch(actorId, { headers });

  if (!response.ok) {
    throw new Error(`Failed to fetch actor: ${response.status}`);
  }

  const actor = await response.json() as {
    id: string;
    inbox: string;
    endpoints?: { sharedInbox?: string };
    preferredUsername: string;
    name?: string;
    icon?: { url?: string } | string;
    publicKey?: { publicKeyPem?: string };
  };

  return {
    id: actor.id,
    inbox: actor.inbox,
    sharedInbox: actor.endpoints?.sharedInbox,
    preferredUsername: actor.preferredUsername,
    name: actor.name,
    icon: typeof actor.icon === 'object' ? actor.icon?.url : actor.icon,
    publicKeyPem: actor.publicKey?.publicKeyPem,
  };
}

export async function followActor(
  handle: string,
  targetActorId: string,
  env: Env
): Promise<{ success: boolean; actorId: string }> {
  // Get private key for signing
  const privateKeyName = `PRIVATE_KEY_${handle}`;
  const privateKeyPem = (env as Record<string, string>)[privateKeyName];
  const keyId = `https://${env.DOMAIN}/users/${handle}#main-key`;

  const signing = privateKeyPem ? { privateKeyPem, keyId } : undefined;
  const actor = await resolveActor(targetActorId, signing);

  // Cache actor for signature verification and display
  if (actor.publicKeyPem) {
    await env.DB.prepare(`
      INSERT OR REPLACE INTO actor_cache
      (actor_url, inbox_url, shared_inbox_url, public_key_pem, name, preferred_username, icon_url, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      actor.id,
      actor.inbox,
      actor.sharedInbox || null,
      actor.publicKeyPem,
      actor.name || null,
      actor.preferredUsername,
      actor.icon || null,
      new Date().toISOString()
    ).run();
  }

  // Check if already following
  const existing = await env.DB.prepare(
    'SELECT * FROM following WHERE handle = ? AND actor_url = ?'
  ).bind(handle, actor.id).first();

  if (existing) {
    return { success: true, actorId: actor.id };
  }

  const followId = `https://${env.DOMAIN}/users/${handle}/follows/${ulid()}`;

  const followActivity = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: followId,
    type: 'Follow',
    actor: `https://${env.DOMAIN}/users/${handle}`,
    object: actor.id,
  };

  // Store as pending (accepted = 0)
  await env.DB.prepare(`
    INSERT INTO following
    (handle, actor_url, inbox_url, accepted, requested_at)
    VALUES (?, ?, ?, 0, ?)
  `).bind(
    handle,
    actor.id,
    actor.inbox,
    new Date().toISOString()
  ).run();

  // Send Follow activity
  await sendActivity(handle, followActivity, actor.inbox, env);

  return { success: true, actorId: actor.id };
}

export async function unfollowActor(
  handle: string,
  targetActorId: string,
  env: Env
): Promise<{ success: boolean }> {
  const following = await env.DB.prepare(
    'SELECT * FROM following WHERE handle = ? AND actor_url = ?'
  ).bind(handle, targetActorId).first();

  if (!following) {
    return { success: true };
  }

  const undoId = `https://${env.DOMAIN}/users/${handle}/follows/${ulid()}/undo`;

  const undoActivity = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: undoId,
    type: 'Undo',
    actor: `https://${env.DOMAIN}/users/${handle}`,
    object: {
      type: 'Follow',
      actor: `https://${env.DOMAIN}/users/${handle}`,
      object: targetActorId,
    },
  };

  // Send Undo activity
  await sendActivity(handle, undoActivity, following.inbox_url as string, env);

  // Remove from following
  await env.DB.prepare(
    'DELETE FROM following WHERE handle = ? AND actor_url = ?'
  ).bind(handle, targetActorId).run();

  return { success: true };
}
