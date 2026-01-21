import { Env, APCollection, APOrderedCollectionPage } from '../types';
import { jsonResponse } from '../utils/response';

export async function handleOutbox(handle: string, url: URL, env: Env): Promise<Response> {
  const page = url.searchParams.get('page');

  // Get total count
  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM posts WHERE handle = ? AND visibility = ?'
  ).bind(handle, 'public').first<{ count: number }>();

  const totalItems = countResult?.count || 0;
  const baseUrl = `https://${env.DOMAIN}/users/${handle}/outbox`;

  if (!page) {
    // Return collection with link to first page
    const collection: APCollection = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: baseUrl,
      type: 'OrderedCollection',
      totalItems,
      first: `${baseUrl}?page=true`,
    };

    return jsonResponse(collection);
  }

  // Get posts for this page
  const limit = 20;
  const minId = url.searchParams.get('min_id');
  const maxId = url.searchParams.get('max_id');

  let query = 'SELECT * FROM posts WHERE handle = ? AND visibility = ?';
  const params: (string | number)[] = [handle, 'public'];

  if (maxId) {
    query += ' AND id < ?';
    params.push(maxId);
  } else if (minId) {
    query += ' AND id > ?';
    params.push(minId);
  }

  query += ' ORDER BY published_at DESC LIMIT ?';
  params.push(limit);

  const { results } = await env.DB.prepare(query).bind(...params).all();
  const posts = results || [];

  // Convert posts to Create activities
  const orderedItems = posts.map((post) => {
    const mediaUrls = JSON.parse((post.media_urls as string) || '[]') as string[];
    const attachment = mediaUrls.map((url) => {
      const ext = url.split('.').pop()?.toLowerCase() || '';
      const mediaTypes: Record<string, string> = {
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        png: 'image/png',
        gif: 'image/gif',
        webp: 'image/webp',
        mp4: 'video/mp4',
        webm: 'video/webm',
      };
      return {
        type: 'Document',
        mediaType: mediaTypes[ext] || 'application/octet-stream',
        url,
      };
    });

    return {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: `https://${env.DOMAIN}/users/${handle}/posts/${post.id}/activity`,
      type: 'Create',
      actor: `https://${env.DOMAIN}/users/${handle}`,
      published: post.published_at,
      to: ['https://www.w3.org/ns/activitystreams#Public'],
      cc: [`https://${env.DOMAIN}/users/${handle}/followers`],
      object: {
        id: `https://${env.DOMAIN}/users/${handle}/posts/${post.id}`,
        type: 'Note',
        attributedTo: `https://${env.DOMAIN}/users/${handle}`,
        content: post.content_html,
        published: post.published_at,
        to: ['https://www.w3.org/ns/activitystreams#Public'],
        cc: [`https://${env.DOMAIN}/users/${handle}/followers`],
        url: `https://${env.DOMAIN}/@${handle}/${post.id}`,
        ...(attachment.length > 0 && { attachment }),
      },
    };
  });

  const collectionPage: APOrderedCollectionPage = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `${baseUrl}?page=true${maxId ? `&max_id=${maxId}` : ''}`,
    type: 'OrderedCollectionPage',
    partOf: baseUrl,
    orderedItems,
  };

  // Add pagination links
  if (posts.length === limit) {
    const lastPost = posts[posts.length - 1];
    collectionPage.next = `${baseUrl}?page=true&max_id=${lastPost.id}`;
  }

  if (maxId && posts.length > 0) {
    collectionPage.prev = `${baseUrl}?page=true&min_id=${posts[0].id}`;
  }

  return jsonResponse(collectionPage);
}
