// Simple markdown to HTML converter for posts
// Handles: hashtags, mentions, links, line breaks, and basic formatting

export function markdownToHtml(content: string, domain: string): string {
  let html = escapeHtml(content);

  // Convert line breaks to <br>
  html = html.replace(/\n/g, '<br>');

  // Convert URLs to links
  html = html.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" rel="nofollow noopener noreferrer" target="_blank">$1</a>'
  );

  // Convert hashtags to links
  html = html.replace(
    /#(\w+)/g,
    `<a href="https://${domain}/tags/$1" class="hashtag" rel="tag">#$1</a>`
  );

  // Convert @mentions to links (simple version)
  html = html.replace(
    /@(\w+)@([^\s<]+)/g,
    '<span class="h-card"><a href="https://$2/@$1" class="u-url mention">@<span>$1</span></a></span>'
  );

  // Wrap in paragraph
  html = `<p>${html}</p>`;

  return html;
}

export function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  };
  return text.replace(/[&<>"']/g, (m) => map[m]);
}

export function extractHashtags(content: string): string[] {
  const matches = content.match(/#(\w+)/g);
  if (!matches) return [];
  return [...new Set(matches.map((tag) => tag.slice(1).toLowerCase()))];
}

export function extractMentions(content: string): { handle: string; domain: string }[] {
  const matches = content.matchAll(/@(\w+)@([^\s]+)/g);
  const mentions: { handle: string; domain: string }[] = [];
  for (const match of matches) {
    mentions.push({ handle: match[1], domain: match[2] });
  }
  return mentions;
}
