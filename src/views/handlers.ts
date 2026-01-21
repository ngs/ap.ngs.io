import { Env } from '../types';
import { homePage } from './home';
import { profilePage } from './profile';
import { followsPage } from './follows';
import { postPage } from './post';

export async function handleHomePage(env: Env): Promise<Response> {
  const { results } = await env.DB.prepare(
    'SELECT handle, name, icon_url FROM accounts'
  ).all();

  const accounts = (results || []).map(r => ({
    handle: r.handle as string,
    name: r.name as string,
    iconUrl: r.icon_url as string | null,
  }));

  const html = homePage(env.DOMAIN, accounts);

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

export async function handleProfilePage(handle: string, env: Env): Promise<Response> {
  const account = await env.DB.prepare(
    'SELECT * FROM accounts WHERE handle = ?'
  ).bind(handle).first();

  if (!account) {
    return new Response('Not Found', { status: 404 });
  }

  const followersResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM followers WHERE handle = ?'
  ).bind(handle).first();

  const followingResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM following WHERE handle = ?'
  ).bind(handle).first();

  const postsResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM posts WHERE handle = ?'
  ).bind(handle).first();

  const { results: postsData } = await env.DB.prepare(
    'SELECT id, content_html, published_at, media_urls FROM posts WHERE handle = ? AND visibility = ? ORDER BY published_at DESC LIMIT 20'
  ).bind(handle, 'public').all();

  const posts = (postsData || []).map(p => ({
    id: p.id as string,
    contentHtml: p.content_html as string,
    publishedAt: p.published_at as string,
    mediaUrls: JSON.parse((p.media_urls as string) || '[]') as string[],
  }));

  const html = profilePage({
    handle: account.handle as string,
    name: account.name as string,
    summary: account.summary as string,
    iconUrl: account.icon_url as string | null,
    imageUrl: account.image_url as string | null,
    domain: env.DOMAIN,
    followersCount: (followersResult?.count as number) || 0,
    followingCount: (followingResult?.count as number) || 0,
    postsCount: (postsResult?.count as number) || 0,
    posts,
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

export async function handleFollowersPage(handle: string, url: URL, env: Env): Promise<Response> {
  const account = await env.DB.prepare(
    'SELECT handle, name FROM accounts WHERE handle = ?'
  ).bind(handle).first();

  if (!account) {
    return new Response('Not Found', { status: 404 });
  }

  const page = parseInt(url.searchParams.get('page') || '1') || 1;
  const limit = 40;
  const offset = (page - 1) * limit;

  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM followers WHERE handle = ?'
  ).bind(handle).first<{ count: number }>();

  const totalCount = countResult?.count || 0;

  const { results } = await env.DB.prepare(
    'SELECT actor_url, actor_json FROM followers WHERE handle = ? ORDER BY followed_at DESC LIMIT ? OFFSET ?'
  ).bind(handle, limit, offset).all();

  const users = await Promise.all((results || []).map(async r => {
    const actorUrl = r.actor_url as string;
    const domain = new URL(actorUrl).hostname;

    // First try cached actor_json
    const actorJson = r.actor_json ? JSON.parse(r.actor_json as string) : null;
    if (actorJson?.preferredUsername) {
      return {
        actorUrl,
        name: actorJson.name,
        preferredUsername: actorJson.preferredUsername,
        iconUrl: actorJson.icon?.url || (typeof actorJson.icon === 'string' ? actorJson.icon : null),
        domain,
      };
    }

    // Fetch actor info if not cached
    try {
      const response = await fetch(actorUrl, {
        headers: {
          'Accept': 'application/activity+json',
          'User-Agent': 'ActivityPub-Server',
        },
      });

      if (response.ok) {
        const actor = await response.json() as {
          name?: string;
          preferredUsername?: string;
          icon?: { url?: string } | string;
        };

        return {
          actorUrl,
          name: actor.name,
          preferredUsername: actor.preferredUsername,
          iconUrl: typeof actor.icon === 'object' ? actor.icon?.url : actor.icon,
          domain,
        };
      }
    } catch {
      // Ignore fetch errors
    }

    return {
      actorUrl,
      name: undefined,
      preferredUsername: undefined,
      iconUrl: undefined,
      domain,
    };
  }));

  const html = followsPage({
    handle: account.handle as string,
    name: account.name as string,
    domain: env.DOMAIN,
    type: 'followers',
    users,
    totalCount,
    page,
    hasNext: results.length === limit,
    hasPrev: page > 1,
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

export async function handleFollowingPage(handle: string, url: URL, env: Env): Promise<Response> {
  const account = await env.DB.prepare(
    'SELECT handle, name FROM accounts WHERE handle = ?'
  ).bind(handle).first();

  if (!account) {
    return new Response('Not Found', { status: 404 });
  }

  const page = parseInt(url.searchParams.get('page') || '1') || 1;
  const limit = 40;
  const offset = (page - 1) * limit;

  const countResult = await env.DB.prepare(
    'SELECT COUNT(*) as count FROM following WHERE handle = ? AND accepted = 1'
  ).bind(handle).first<{ count: number }>();

  const totalCount = countResult?.count || 0;

  const { results } = await env.DB.prepare(
    'SELECT actor_url FROM following WHERE handle = ? AND accepted = 1 ORDER BY accepted_at DESC LIMIT ? OFFSET ?'
  ).bind(handle, limit, offset).all();

  // Fetch actor info for each following (we don't store actor_json for following)
  const users = await Promise.all((results || []).map(async r => {
    const actorUrl = r.actor_url as string;
    const domain = new URL(actorUrl).hostname;

    // Try to fetch actor info
    try {
      const response = await fetch(actorUrl, {
        headers: {
          'Accept': 'application/activity+json',
          'User-Agent': 'ActivityPub-Server',
        },
      });

      if (response.ok) {
        const actor = await response.json() as {
          name?: string;
          preferredUsername?: string;
          icon?: { url?: string } | string;
        };

        return {
          actorUrl,
          name: actor.name,
          preferredUsername: actor.preferredUsername,
          iconUrl: typeof actor.icon === 'object' ? actor.icon?.url : actor.icon,
          domain,
        };
      }
    } catch {
      // Ignore fetch errors
    }

    return {
      actorUrl,
      name: undefined,
      preferredUsername: undefined,
      iconUrl: undefined,
      domain,
    };
  }));

  const html = followsPage({
    handle: account.handle as string,
    name: account.name as string,
    domain: env.DOMAIN,
    type: 'following',
    users,
    totalCount,
    page,
    hasNext: results.length === limit,
    hasPrev: page > 1,
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

export async function handlePostPage(handle: string, postId: string, env: Env): Promise<Response> {
  const account = await env.DB.prepare(
    'SELECT handle, name, icon_url FROM accounts WHERE handle = ?'
  ).bind(handle).first();

  if (!account) {
    return new Response('Not Found', { status: 404 });
  }

  const post = await env.DB.prepare(
    'SELECT id, content_html, published_at, media_urls FROM posts WHERE handle = ? AND id = ?'
  ).bind(handle, postId).first();

  if (!post) {
    return new Response('Not Found', { status: 404 });
  }

  const html = postPage({
    handle: account.handle as string,
    name: account.name as string,
    iconUrl: account.icon_url as string | null,
    domain: env.DOMAIN,
    postId: post.id as string,
    contentHtml: post.content_html as string,
    publishedAt: post.published_at as string,
    mediaUrls: JSON.parse((post.media_urls as string) || '[]') as string[],
  });

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}
