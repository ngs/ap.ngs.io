import { Env } from '../types';
import { syncFromGitHub, syncToGitHub } from '../github/sync';
import { broadcastToFollowers, processDeliveryQueue } from '../activitypub/delivery';
import { followActor, unfollowActor } from '../activitypub/follow';
import { ulid } from '../utils/ulid';
import { jsonResponse, errorResponse, badRequestResponse } from '../utils/response';

interface SyncRequest {
  handle?: string;
  direction?: 'from_github' | 'to_github';
}

interface PublishRequest {
  handle?: string;
}

export async function handleAdminSync(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as SyncRequest;
    const direction = body.direction || 'from_github';

    let result;
    if (direction === 'to_github') {
      result = await syncToGitHub(env);
    } else {
      result = await syncFromGitHub(env, body.handle);
    }

    return jsonResponse({
      success: true,
      direction,
      synced: result.synced,
    });
  } catch (error) {
    console.error('Sync error:', error);
    return errorResponse(`Sync error: ${error}`);
  }
}

export async function handleAdminPublish(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as PublishRequest;

    if (!body.handle) {
      return badRequestResponse('handle is required');
    }

    // Get all posts that haven't been published yet (no activity in outbox_queue)
    // For simplicity, we'll broadcast all recent posts
    const { results } = await env.DB.prepare(`
      SELECT * FROM posts
      WHERE handle = ? AND visibility = 'public'
      ORDER BY published_at DESC
      LIMIT 10
    `).bind(body.handle).all();

    if (!results || results.length === 0) {
      return jsonResponse({ success: true, published: 0 });
    }

    let published = 0;

    for (const post of results) {
      const activity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: `https://${env.DOMAIN}/users/${body.handle}/posts/${post.id}/activity`,
        type: 'Create',
        actor: `https://${env.DOMAIN}/users/${body.handle}`,
        published: post.published_at,
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        cc: [`https://${env.DOMAIN}/users/${body.handle}/followers`],
        object: {
          id: `https://${env.DOMAIN}/users/${body.handle}/posts/${post.id}`,
          type: 'Note',
          attributedTo: `https://${env.DOMAIN}/users/${body.handle}`,
          content: post.content_html,
          published: post.published_at,
          to: ['https://www.w3.org/ns/activitystreams#Public'],
          cc: [`https://${env.DOMAIN}/users/${body.handle}/followers`],
          url: `https://${env.DOMAIN}/@${body.handle}/${post.id}`,
        },
      };

      await broadcastToFollowers(body.handle, activity, env);
      published++;
    }

    return jsonResponse({ success: true, published });
  } catch (error) {
    console.error('Publish error:', error);
    return errorResponse(`Publish error: ${error}`);
  }
}

export async function handleAdminAccounts(env: Env): Promise<Response> {
  try {
    const { results } = await env.DB.prepare(
      'SELECT handle, name, summary, created_at FROM accounts'
    ).all();

    return jsonResponse({
      accounts: results || [],
    });
  } catch (error) {
    console.error('Accounts error:', error);
    return errorResponse(`Accounts error: ${error}`);
  }
}

export async function handleAdminProcessQueue(env: Env): Promise<Response> {
  try {
    const processed = await processDeliveryQueue(env);
    return jsonResponse({ success: true, processed });
  } catch (error) {
    console.error('Process queue error:', error);
    return errorResponse(`Process queue error: ${error}`);
  }
}

interface FollowRequest {
  handle: string;
  target: string;  // acct:user@domain or https://... actor URL
}

export async function handleAdminFollow(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as FollowRequest;

    if (!body.handle || !body.target) {
      return badRequestResponse('handle and target are required');
    }

    // Verify account exists
    const account = await env.DB.prepare(
      'SELECT handle FROM accounts WHERE handle = ?'
    ).bind(body.handle).first();

    if (!account) {
      return badRequestResponse(`Account ${body.handle} not found`);
    }

    const result = await followActor(body.handle, body.target, env);

    return jsonResponse({
      success: result.success,
      actorId: result.actorId,
      message: 'Follow request sent',
    });
  } catch (error) {
    console.error('Follow error:', error);
    return errorResponse(`Follow error: ${error}`);
  }
}

export async function handleAdminUnfollow(request: Request, env: Env): Promise<Response> {
  try {
    const body = await request.json() as FollowRequest;

    if (!body.handle || !body.target) {
      return badRequestResponse('handle and target are required');
    }

    const result = await unfollowActor(body.handle, body.target, env);

    return jsonResponse({
      success: result.success,
      message: 'Unfollow request sent',
    });
  } catch (error) {
    console.error('Unfollow error:', error);
    return errorResponse(`Unfollow error: ${error}`);
  }
}
