import { Env } from '../types';

const GITHUB_API = 'https://api.github.com';

export async function getFile(path: string, env: Env): Promise<{ content: string; sha: string } | null> {
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

export async function listFiles(path: string, env: Env): Promise<string[]> {
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

export async function putFile(path: string, content: string, message: string, env: Env): Promise<void> {
  const [owner, repo] = env.GITHUB_REPO.split('/');
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;

  const existing = await getFile(path, env);
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
}

function encodeBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function decodeBase64(str: string): string {
  return decodeURIComponent(escape(atob(str.replace(/\n/g, ''))));
}
