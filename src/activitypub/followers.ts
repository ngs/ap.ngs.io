import { Env, APCollection, APOrderedCollectionPage } from '../types';
import { jsonResponse } from '../utils/response';

export async function handleFollowers(handle: string, url: URL, env: Env): Promise<Response> {
  const page = url.searchParams.get('page');

  // Get total count
  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM followers WHERE handle = ?'
  ).bind(handle).first<{ count: number }>();

  const totalItems = countResult?.count || 0;
  const baseUrl = `https://${env.DOMAIN}/users/${handle}/followers`;

  if (!page) {
    // Return collection with link to first page
    const collection: APCollection = {
      '@context': 'https://www.w3.org/ns/activitystreams',
      id: baseUrl,
      type: 'OrderedCollection',
      totalItems,
      first: `${baseUrl}?page=1`,
    };

    return jsonResponse(collection);
  }

  // Get followers for this page
  const pageNum = parseInt(page) || 1;
  const limit = 40;
  const offset = (pageNum - 1) * limit;

  const { results } = await env.DB.prepare(
    'SELECT actor_url FROM followers WHERE handle = ? ORDER BY followed_at DESC LIMIT ? OFFSET ?'
  ).bind(handle, limit, offset).all();

  const followers = results || [];
  const orderedItems = followers.map((f) => f.actor_url as string);

  const collectionPage: APOrderedCollectionPage = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `${baseUrl}?page=${pageNum}`,
    type: 'OrderedCollectionPage',
    partOf: baseUrl,
    orderedItems,
  };

  // Add pagination links
  if (followers.length === limit) {
    collectionPage.next = `${baseUrl}?page=${pageNum + 1}`;
  }

  if (pageNum > 1) {
    collectionPage.prev = `${baseUrl}?page=${pageNum - 1}`;
  }

  return jsonResponse(collectionPage);
}
