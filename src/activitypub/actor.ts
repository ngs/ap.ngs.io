import { Env, APActor } from '../types';
import { jsonResponse, notFoundResponse } from '../utils/response';

export async function handleActor(handle: string, env: Env): Promise<Response> {
  const account = await env.DB.prepare(
    'SELECT * FROM accounts WHERE handle = ?'
  ).bind(handle).first();

  if (!account) {
    return notFoundResponse();
  }

  const actor: APActor = {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1',
      {
        'manuallyApprovesFollowers': 'as:manuallyApprovesFollowers',
        'discoverable': 'toot:discoverable',
        'toot': 'http://joinmastodon.org/ns#',
        'schema': 'http://schema.org#',
        'PropertyValue': 'schema:PropertyValue',
        'value': 'schema:value',
      },
    ],
    id: `https://${env.DOMAIN}/users/${handle}`,
    type: 'Person',
    preferredUsername: handle,
    name: account.name as string,
    summary: account.summary as string || '',
    url: `https://${env.DOMAIN}/@${handle}`,
    inbox: `https://${env.DOMAIN}/users/${handle}/inbox`,
    outbox: `https://${env.DOMAIN}/users/${handle}/outbox`,
    followers: `https://${env.DOMAIN}/users/${handle}/followers`,
    following: `https://${env.DOMAIN}/users/${handle}/following`,
    publicKey: {
      id: `https://${env.DOMAIN}/users/${handle}#main-key`,
      owner: `https://${env.DOMAIN}/users/${handle}`,
      publicKeyPem: account.public_key as string,
    },
    manuallyApprovesFollowers: account.manually_approves_followers === 1,
    discoverable: account.discoverable === 1,
    published: account.created_at as string,
    endpoints: {
      sharedInbox: `https://${env.DOMAIN}/inbox`,
    },
  };

  if (account.icon_url) {
    actor.icon = {
      type: 'Image',
      mediaType: 'image/png',
      url: account.icon_url as string,
    };
  }

  if (account.image_url) {
    actor.image = {
      type: 'Image',
      mediaType: 'image/png',
      url: account.image_url as string,
    };
  }

  // Profile metadata fields (for verified links)
  if (account.fields) {
    const fields = JSON.parse(account.fields as string) as Array<{ name: string; value: string }>;
    if (fields.length > 0) {
      actor.attachment = fields.map((field) => ({
        type: 'PropertyValue',
        name: field.name,
        value: field.value.startsWith('http')
          ? `<a href="${field.value}" target="_blank" rel="nofollow noopener noreferrer me">${field.value}</a>`
          : field.value,
      }));
    }
  }

  return new Response(JSON.stringify(actor), {
    headers: {
      'Content-Type': 'application/activity+json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'max-age=300',
    },
  });
}
