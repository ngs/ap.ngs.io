import { Env } from '../types';
import { jsonResponse, jrdResponse } from '../utils/response';

export function handleNodeInfoWellKnown(env: Env): Response {
  const response = {
    links: [
      {
        rel: 'http://nodeinfo.diaspora.software/ns/schema/2.1',
        href: `https://${env.DOMAIN}/nodeinfo/2.1`,
      },
    ],
  };

  return jrdResponse(response);
}

export async function handleNodeInfo(env: Env): Promise<Response> {
  // Get user count
  const userResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM accounts'
  ).first<{ count: number }>();

  // Get post count
  const postResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM posts'
  ).first<{ count: number }>();

  const response = {
    version: '2.1',
    software: {
      name: 'activitypub-server',
      version: '1.0.0',
      repository: 'https://github.com/ngs/activitypub-server',
    },
    protocols: ['activitypub'],
    usage: {
      users: {
        total: userResult?.count || 0,
        activeMonth: userResult?.count || 0,
        activeHalfyear: userResult?.count || 0,
      },
      localPosts: postResult?.count || 0,
    },
    openRegistrations: false,
    metadata: {},
  };

  return new Response(JSON.stringify(response), {
    headers: {
      'Content-Type': 'application/json; profile="http://nodeinfo.diaspora.software/ns/schema/2.1#"',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'max-age=1800',
    },
  });
}
