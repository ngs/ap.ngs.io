import { Env, APActivity } from '../types';
import { buildNote } from './note';
import { broadcastToFollowers } from './delivery';

export interface PublishResult {
  published: number;
  posts: Array<{ id: string; handle: string }>;
}

/**
 * Find posts that haven't been federated yet and broadcast them to followers
 */
export async function publishNewPosts(env: Env, handle?: string): Promise<PublishResult> {
  // Find posts that haven't been federated
  let query = `
    SELECT * FROM posts
    WHERE federated_at IS NULL
    AND visibility IN ('public', 'unlisted')
  `;
  const params: string[] = [];

  if (handle) {
    query += ' AND handle = ?';
    params.push(handle);
  }

  query += ' ORDER BY published_at ASC';

  const { results } = await env.DB.prepare(query).bind(...params).all();
  const posts = results || [];

  if (posts.length === 0) {
    return { published: 0, posts: [] };
  }

  const publishedPosts: Array<{ id: string; handle: string }> = [];

  for (const post of posts) {
    const postHandle = post.handle as string;
    const postId = post.id as string;

    try {
      // Build the Note
      const note = buildNote(post, postHandle, env.DOMAIN);

      // Create the Create activity
      const activity: APActivity = {
        '@context': 'https://www.w3.org/ns/activitystreams',
        id: `https://${env.DOMAIN}/users/${postHandle}/posts/${postId}/activity`,
        type: 'Create',
        actor: `https://${env.DOMAIN}/users/${postHandle}`,
        published: post.published_at as string,
        to: note.to,
        cc: note.cc,
        object: note,
      };

      // Broadcast to followers
      await broadcastToFollowers(postHandle, activity, env);

      // Mark as federated
      await env.DB.prepare(
        'UPDATE posts SET federated_at = ? WHERE handle = ? AND id = ?'
      ).bind(new Date().toISOString(), postHandle, postId).run();

      publishedPosts.push({ id: postId, handle: postHandle });
      console.log(`Published post ${postId} by ${postHandle}`);
    } catch (error) {
      console.error(`Failed to publish post ${postId}:`, error);
    }
  }

  return { published: publishedPosts.length, posts: publishedPosts };
}

/**
 * Publish a specific post by ID
 */
export async function publishPost(handle: string, postId: string, env: Env): Promise<boolean> {
  const post = await env.DB.prepare(
    'SELECT * FROM posts WHERE handle = ? AND id = ?'
  ).bind(handle, postId).first();

  if (!post) {
    return false;
  }

  // Build the Note
  const note = buildNote(post, handle, env.DOMAIN);

  // Create the Create activity
  const activity: APActivity = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `https://${env.DOMAIN}/users/${handle}/posts/${postId}/activity`,
    type: 'Create',
    actor: `https://${env.DOMAIN}/users/${handle}`,
    published: post.published_at as string,
    to: note.to,
    cc: note.cc,
    object: note,
  };

  // Broadcast to followers
  await broadcastToFollowers(handle, activity, env);

  // Mark as federated
  await env.DB.prepare(
    'UPDATE posts SET federated_at = ? WHERE handle = ? AND id = ?'
  ).bind(new Date().toISOString(), handle, postId).run();

  return true;
}
