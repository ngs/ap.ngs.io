import { Env } from '../types';
import { notFoundResponse, errorResponse } from '../utils/response';

export async function handleMedia(handle: string, filename: string, env: Env): Promise<Response> {
  const [owner, repo] = env.GITHUB_REPO.split('/');
  const githubUrl = `https://raw.githubusercontent.com/${owner}/${repo}/master/accounts/${handle}/media/${filename}`;

  try {
    const response = await fetch(githubUrl, {
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': 'ActivityPub-Server',
      },
    });

    if (!response.ok) {
      return notFoundResponse();
    }

    const ext = filename.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'mp4': 'video/mp4',
      'webm': 'video/webm',
    };
    const contentType = contentTypes[ext || ''] || 'application/octet-stream';

    return new Response(response.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Media fetch error:', error);
    return errorResponse('Internal Server Error');
  }
}
