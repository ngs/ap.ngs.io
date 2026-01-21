import { Env } from '../types';
import { parsePostMarkdown } from './parser';

const GITHUB_API = 'https://api.github.com';

export async function syncFromGitHub(env: Env, handle?: string): Promise<{ synced: number }> {
  let synced = 0;

  let handles: string[];
  if (handle) {
    handles = [handle];
  } else {
    // First try to get handles from DB
    handles = await listAccountHandles(env);
    // If no accounts in DB, discover from GitHub
    if (handles.length === 0) {
      handles = await discoverAccountsFromGitHub(env);
    }
  }

  for (const h of handles) {
    // profile.json
    const profile = await getGitHubFile(`accounts/${h}/profile.json`, env);
    if (profile) {
      const data = JSON.parse(profile.content);
      const publicKey = await getGitHubFile(`accounts/${h}/public_key.pem`, env);

      await env.DB.prepare(`
        INSERT OR REPLACE INTO accounts
        (handle, name, summary, icon_url, image_url, public_key,
         manually_approves_followers, discoverable, fields, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?,
                COALESCE((SELECT created_at FROM accounts WHERE handle = ?), ?), ?)
      `).bind(
        h,
        data.name || h,
        data.summary || '',
        data.icon ? `https://${env.DOMAIN}/media/${h}/${data.icon}` : null,
        data.image ? `https://${env.DOMAIN}/media/${h}/${data.image}` : null,
        publicKey?.content || '',
        data.manuallyApprovesFollowers ? 1 : 0,
        data.discoverable !== false ? 1 : 0,
        data.fields ? JSON.stringify(data.fields) : null,
        h,
        new Date().toISOString(),
        new Date().toISOString()
      ).run();
      synced++;
    }

    // posts/*.md
    const postFiles = await listGitHubFiles(`accounts/${h}/posts`, env);
    const postIds: string[] = [];

    for (const file of postFiles.filter(f => f.endsWith('.md'))) {
      const content = await getGitHubFile(`accounts/${h}/posts/${file}`, env);
      if (content) {
        const post = parsePostMarkdown(content.content, file, h, env.DOMAIN);
        postIds.push(post.id);

        await env.DB.prepare(`
          INSERT OR REPLACE INTO posts
          (id, handle, content, content_html, published_at, in_reply_to,
           conversation, sensitive, summary, media_urls, tags, visibility,
           created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                  COALESCE((SELECT created_at FROM posts WHERE handle = ? AND id = ?), ?), ?)
        `).bind(
          post.id,
          h,
          post.content,
          post.contentHtml,
          post.publishedAt,
          post.inReplyTo || null,
          post.conversation || null,
          post.sensitive ? 1 : 0,
          post.summary || null,
          JSON.stringify(post.mediaUrls),
          JSON.stringify(post.tags),
          post.visibility,
          h,
          post.id,
          new Date().toISOString(),
          new Date().toISOString()
        ).run();
        synced++;
      }
    }

    // Delete posts that no longer exist in GitHub
    if (postIds.length > 0) {
      const placeholders = postIds.map(() => '?').join(',');
      await env.DB.prepare(
        `DELETE FROM posts WHERE handle = ? AND id NOT IN (${placeholders})`
      ).bind(h, ...postIds).run();
    } else {
      // No posts in GitHub, delete all posts for this handle
      await env.DB.prepare('DELETE FROM posts WHERE handle = ?').bind(h).run();
    }

    // Restore followers from GitHub (replace all)
    const followersFile = await getGitHubFile(`accounts/${h}/data/followers.json`, env);
    if (followersFile) {
      // Delete existing and replace with GitHub data
      await env.DB.prepare('DELETE FROM followers WHERE handle = ?').bind(h).run();

      const followers = JSON.parse(followersFile.content) as Array<{
        actorUrl: string;
        inboxUrl: string;
        sharedInboxUrl?: string;
        followedAt: string;
      }>;
      for (const f of followers) {
        await env.DB.prepare(`
          INSERT INTO followers
          (handle, actor_url, inbox_url, shared_inbox_url, followed_at)
          VALUES (?, ?, ?, ?, ?)
        `).bind(h, f.actorUrl, f.inboxUrl, f.sharedInboxUrl || null, f.followedAt).run();
      }
      synced++;
    }

    // Restore following from GitHub (replace all)
    const followingFile = await getGitHubFile(`accounts/${h}/data/following.json`, env);
    if (followingFile) {
      // Delete existing and replace with GitHub data
      await env.DB.prepare('DELETE FROM following WHERE handle = ?').bind(h).run();

      const following = JSON.parse(followingFile.content) as Array<{
        actorUrl: string;
        inboxUrl: string;
        accepted: boolean;
        requestedAt: string;
        acceptedAt?: string;
      }>;
      for (const f of following) {
        await env.DB.prepare(`
          INSERT INTO following
          (handle, actor_url, inbox_url, accepted, requested_at, accepted_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).bind(h, f.actorUrl, f.inboxUrl, f.accepted ? 1 : 0, f.requestedAt, f.acceptedAt || null).run();
      }
      synced++;
    }
  }

  return { synced };
}

export async function syncToGitHub(env: Env): Promise<{ synced: number }> {
  let synced = 0;
  const handles = await listAccountHandles(env);

  for (const handle of handles) {
    // Sync followers to GitHub
    const { results: followers } = await env.DB.prepare(`
      SELECT actor_url, inbox_url, shared_inbox_url, followed_at
      FROM followers WHERE handle = ?
    `).bind(handle).all();

    const followersJson = JSON.stringify(
      (followers || []).map(f => ({
        actorUrl: f.actor_url,
        inboxUrl: f.inbox_url,
        sharedInboxUrl: f.shared_inbox_url,
        followedAt: f.followed_at,
      })),
      null,
      2
    );

    if (await putGitHubFile(`accounts/${handle}/data/followers.json`, followersJson, 'Sync followers', env)) {
      synced++;
    }

    // Sync following to GitHub
    const { results: following } = await env.DB.prepare(`
      SELECT actor_url, inbox_url, accepted, requested_at, accepted_at
      FROM following WHERE handle = ?
    `).bind(handle).all();

    const followingJson = JSON.stringify(
      (following || []).map(f => ({
        actorUrl: f.actor_url,
        inboxUrl: f.inbox_url,
        accepted: f.accepted === 1,
        requestedAt: f.requested_at,
        acceptedAt: f.accepted_at,
      })),
      null,
      2
    );

    if (await putGitHubFile(`accounts/${handle}/data/following.json`, followingJson, 'Sync following', env)) {
      synced++;
    }

    // Sync unsynced received activities
    const { results: activities } = await env.DB.prepare(`
      SELECT * FROM inbox_activities
      WHERE handle = ? AND synced_to_github = 0
      ORDER BY received_at LIMIT 100
    `).bind(handle).all();

    if (activities && activities.length > 0) {
      const byType: Record<string, unknown[]> = {};

      for (const activity of activities) {
        const type = activity.type as string;
        if (!byType[type]) byType[type] = [];
        byType[type].push({
          id: activity.id,
          actorUrl: activity.actor_url,
          objectUrl: activity.object_url,
          receivedAt: activity.received_at,
        });

        await env.DB.prepare(
          'UPDATE inbox_activities SET synced_to_github = 1 WHERE id = ?'
        ).bind(activity.id).run();
      }

      const typeToFile: Record<string, string> = {
        'Create': 'replies.json',
        'Like': 'likes.json',
        'Announce': 'boosts.json',
      };

      for (const [type, items] of Object.entries(byType)) {
        const filename = typeToFile[type];
        if (!filename) continue;

        const path = `accounts/${handle}/data/received/${filename}`;
        const existing = await getGitHubFile(path, env);
        let allItems: unknown[] = existing ? JSON.parse(existing.content) : [];
        allItems.push(...items);

        if (await putGitHubFile(path, JSON.stringify(allItems, null, 2), `Sync ${type}`, env)) {
          synced++;
        }
      }
    }
  }

  return { synced };
}

async function listAccountHandles(env: Env): Promise<string[]> {
  const { results } = await env.DB.prepare('SELECT handle FROM accounts').all();
  return (results || []).map(r => r.handle as string);
}

async function discoverAccountsFromGitHub(env: Env): Promise<string[]> {
  const [owner, repo] = env.GITHUB_REPO.split('/');
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/accounts`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ActivityPub-Server',
    },
  });

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = await response.json() as Array<{ type: string; name: string }>;
  return data.filter(item => item.type === 'dir').map(item => item.name);
}

export async function getGitHubFile(path: string, env: Env): Promise<{ content: string; sha: string } | null> {
  const [owner, repo] = env.GITHUB_REPO.split('/');
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ActivityPub-Server',
    },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = await response.json() as { content: string; sha: string };
  const content = decodeBase64(data.content);
  return { content, sha: data.sha };
}

export async function listGitHubFiles(path: string, env: Env): Promise<string[]> {
  const [owner, repo] = env.GITHUB_REPO.split('/');
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ActivityPub-Server',
    },
  });

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = await response.json() as Array<{ type: string; name: string }>;
  return data.filter(item => item.type === 'file').map(item => item.name);
}

async function putGitHubFile(path: string, content: string, message: string, env: Env): Promise<boolean> {
  const [owner, repo] = env.GITHUB_REPO.split('/');
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;

  const existing = await getGitHubFile(path, env);

  // Skip if content is unchanged
  if (existing && existing.content === content) {
    return false;
  }

  const body: { message: string; content: string; sha?: string } = { message, content: encodeBase64(content) };
  if (existing) body.sha = existing.sha;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ActivityPub-Server',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }

  return true;
}

function encodeBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function decodeBase64(str: string): string {
  return decodeURIComponent(escape(atob(str.replace(/\n/g, ''))));
}
