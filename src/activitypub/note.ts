import { Env, APNote, APActivity, APTag, APAttachment } from '../types';
import { jsonResponse, notFoundResponse } from '../utils/response';

export async function handleNote(handle: string, postId: string, env: Env): Promise<Response> {
  const post = await env.DB.prepare(
    'SELECT * FROM posts WHERE handle = ? AND id = ?'
  ).bind(handle, postId).first();

  if (!post) {
    return notFoundResponse();
  }

  const note = buildNote(post, handle, env.DOMAIN);
  return jsonResponse(note);
}

export async function handleNoteActivity(handle: string, postId: string, env: Env): Promise<Response> {
  const post = await env.DB.prepare(
    'SELECT * FROM posts WHERE handle = ? AND id = ?'
  ).bind(handle, postId).first();

  if (!post) {
    return notFoundResponse();
  }

  const note = buildNote(post, handle, env.DOMAIN);

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

  return jsonResponse(activity);
}

function buildNote(post: Record<string, unknown>, handle: string, domain: string): APNote {
  const visibility = post.visibility as string;
  const to: string[] = [];
  const cc: string[] = [];

  switch (visibility) {
    case 'public':
      to.push('https://www.w3.org/ns/activitystreams#Public');
      cc.push(`https://${domain}/users/${handle}/followers`);
      break;
    case 'unlisted':
      to.push(`https://${domain}/users/${handle}/followers`);
      cc.push('https://www.w3.org/ns/activitystreams#Public');
      break;
    case 'followers':
      to.push(`https://${domain}/users/${handle}/followers`);
      break;
    case 'direct':
      // Direct messages would need recipient handling
      break;
  }

  // Parse tags
  const tagsJson = post.tags as string || '[]';
  const tagNames = JSON.parse(tagsJson) as string[];
  const tags: APTag[] = tagNames.map((tag) => ({
    type: 'Hashtag',
    href: `https://${domain}/tags/${tag}`,
    name: `#${tag}`,
  }));

  // Parse media
  const mediaUrlsJson = post.media_urls as string || '[]';
  const mediaUrls = JSON.parse(mediaUrlsJson) as string[];
  const attachments: APAttachment[] = mediaUrls.map((url) => {
    const ext = url.split('.').pop()?.toLowerCase() || '';
    let mediaType = 'application/octet-stream';
    let type: APAttachment['type'] = 'Document';

    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)) {
      mediaType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
      type = 'Image';
    } else if (['mp4', 'webm'].includes(ext)) {
      mediaType = `video/${ext}`;
      type = 'Video';
    } else if (['mp3', 'ogg', 'wav'].includes(ext)) {
      mediaType = `audio/${ext}`;
      type = 'Audio';
    }

    return {
      type,
      mediaType,
      url,
    };
  });

  const note: APNote = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `https://${domain}/users/${handle}/posts/${post.id}`,
    type: 'Note',
    attributedTo: `https://${domain}/users/${handle}`,
    content: post.content_html as string,
    published: post.published_at as string,
    to,
    cc,
    url: `https://${domain}/@${handle}/${post.id}`,
  };

  if (post.in_reply_to) {
    note.inReplyTo = post.in_reply_to as string;
  }

  if (post.conversation) {
    note.conversation = post.conversation as string;
  }

  if (post.sensitive) {
    note.sensitive = true;
  }

  if (post.summary) {
    note.summary = post.summary as string;
  }

  if (tags.length > 0) {
    note.tag = tags;
  }

  if (attachments.length > 0) {
    note.attachment = attachments;
  }

  return note;
}
