import { layout, escapeHtml } from './layout';

interface PostData {
  id: string;
  contentHtml: string;
  publishedAt: string;
  mediaUrls: string[];
}

interface ProfileData {
  handle: string;
  name: string;
  summary: string;
  iconUrl: string | null;
  imageUrl: string | null;
  domain: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  posts: PostData[];
}

export function profilePage(data: ProfileData): string {
  const content = `
    ${data.imageUrl ? `<img src="${escapeHtml(data.imageUrl)}" alt="" class="header-image rounded-2 mb-3">` : ''}
    <div class="d-flex flex-items-start flex-column flex-md-row gutter-md">
      <div class="col-12 col-md-3">
        ${data.iconUrl
          ? `<img src="${escapeHtml(data.iconUrl)}" alt="${escapeHtml(data.name)}" class="avatar avatar-large circle mb-3">`
          : `<div class="avatar avatar-large circle mb-3 color-bg-subtle d-flex flex-items-center flex-justify-center"><span class="f1">${escapeHtml(data.handle.charAt(0).toUpperCase())}</span></div>`
        }
        <h1 class="h3 mb-1">${escapeHtml(data.name)}</h1>
        <p class="color-fg-muted mb-3">@${escapeHtml(data.handle)}@${escapeHtml(data.domain)}</p>
        <div class="d-flex gap-3 mb-3">
          <a href="https://${escapeHtml(data.domain)}/users/${escapeHtml(data.handle)}/followers" class="Link--secondary">
            <strong>${data.followersCount}</strong> followers
          </a>
          <a href="https://${escapeHtml(data.domain)}/users/${escapeHtml(data.handle)}/following" class="Link--secondary">
            <strong>${data.followingCount}</strong> following
          </a>
        </div>
      </div>
      <div class="col-12 col-md-9">
        <div class="Box p-3 mb-3">
          <p class="wb-break-word">${formatSummary(data.summary)}</p>
        </div>
        <div class="Box">
          <div class="Box-header d-flex flex-items-center flex-justify-between">
            <h2 class="Box-title">Posts</h2>
            <span class="Counter">${data.postsCount}</span>
          </div>
          ${data.posts.length > 0 ? data.posts.map(post => `
            <div class="Box-row">
              <div class="mb-2">${post.contentHtml}</div>
              ${post.mediaUrls.length > 0 ? `
                <div class="d-flex flex-wrap gap-2 mb-2">
                  ${post.mediaUrls.map(url => `
                    <a href="${escapeHtml(url)}" target="_blank">
                      <img src="${escapeHtml(url)}" alt="" class="rounded-2" style="max-width: 200px; max-height: 200px; object-fit: cover;">
                    </a>
                  `).join('')}
                </div>
              ` : ''}
              <div class="f6 color-fg-muted">
                <a href="https://${escapeHtml(data.domain)}/@${escapeHtml(data.handle)}/${escapeHtml(post.id)}" class="Link--secondary">
                  ${formatDate(post.publishedAt)}
                </a>
              </div>
            </div>
          `).join('') : `
            <div class="Box-row color-fg-muted">
              <p>No posts yet</p>
            </div>
          `}
        </div>
      </div>
    </div>
  `;

  return layout(`${data.name} (@${data.handle}@${data.domain})`, content, data.domain);
}

function formatSummary(summary: string): string {
  // Convert URLs to links and escape HTML
  return escapeHtml(summary)
    .replace(/\n/g, '<br>')
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" class="Link" rel="nofollow noopener" target="_blank">$1</a>'
    );
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
