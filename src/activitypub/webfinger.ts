import { Env } from '../types';
import { jrdResponse, notFoundResponse, badRequestResponse } from '../utils/response';

export async function handleWebFinger(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const resource = url.searchParams.get('resource');

  if (!resource?.startsWith('acct:')) {
    return badRequestResponse();
  }

  const acct = resource.slice(5);
  const [handle, domain] = acct.split('@');

  if (domain !== env.DOMAIN) {
    return notFoundResponse();
  }

  const account = await env.DB.prepare(
    'SELECT handle FROM accounts WHERE handle = ?'
  ).bind(handle).first();

  if (!account) {
    return notFoundResponse();
  }

  const response = {
    subject: resource,
    aliases: [
      `https://${env.DOMAIN}/users/${handle}`,
      `https://${env.DOMAIN}/@${handle}`,
    ],
    links: [
      {
        rel: 'self',
        type: 'application/activity+json',
        href: `https://${env.DOMAIN}/users/${handle}`,
      },
      {
        rel: 'http://webfinger.net/rel/profile-page',
        type: 'text/html',
        href: `https://${env.DOMAIN}/@${handle}`,
      },
    ],
  };

  return jrdResponse(response);
}
