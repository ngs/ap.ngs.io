import { Post } from '../types';
import { markdownToHtml, extractHashtags } from '../utils/markdown';

interface PostFrontMatter {
  id?: string;
  published?: string;
  visibility?: string;
  sensitive?: boolean;
  summary?: string;
  in_reply_to?: string;
  conversation?: string;
}

export function parsePostMarkdown(content: string, filename: string, handle: string, domain: string): Post {
  // Parse front matter
  const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);

  let frontMatter: PostFrontMatter = {};
  let body = content;

  if (frontMatterMatch) {
    frontMatter = parseFrontMatter(frontMatterMatch[1]);
    body = frontMatterMatch[2].trim();
  }

  // Extract ID from filename if not in front matter
  const id = frontMatter.id || filename.replace(/\.md$/, '');

  // Extract images from markdown
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
  const mediaUrls: string[] = [];
  let match;

  while ((match = imageRegex.exec(body)) !== null) {
    const imagePath = match[2];
    // Convert relative paths to absolute URLs
    if (!imagePath.startsWith('http')) {
      mediaUrls.push(`https://${domain}/media/${handle}/${imagePath}`);
    } else {
      mediaUrls.push(imagePath);
    }
  }

  // Remove image markdown from body for plain text content
  const textContent = body.replace(imageRegex, '').trim();

  // Convert to HTML
  const contentHtml = markdownToHtml(textContent, domain);

  // Extract tags
  const tags = extractHashtags(textContent);

  return {
    id,
    handle,
    content: textContent,
    contentHtml,
    publishedAt: frontMatter.published || new Date().toISOString(),
    inReplyTo: frontMatter.in_reply_to,
    conversation: frontMatter.conversation,
    sensitive: frontMatter.sensitive || false,
    summary: frontMatter.summary,
    mediaUrls,
    tags,
    visibility: (frontMatter.visibility as Post['visibility']) || 'public',
  };
}

function parseFrontMatter(frontMatter: string): PostFrontMatter {
  const result: PostFrontMatter = {};
  const lines = frontMatter.split('\n');

  for (const line of lines) {
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;

    const key = line.slice(0, colonIndex).trim();
    let value = line.slice(colonIndex + 1).trim();

    // Remove quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    switch (key) {
      case 'id':
        result.id = value;
        break;
      case 'published':
        result.published = value;
        break;
      case 'visibility':
        result.visibility = value;
        break;
      case 'sensitive':
        result.sensitive = value === 'true';
        break;
      case 'summary':
        result.summary = value;
        break;
      case 'in_reply_to':
        result.in_reply_to = value;
        break;
      case 'conversation':
        result.conversation = value;
        break;
    }
  }

  return result;
}
