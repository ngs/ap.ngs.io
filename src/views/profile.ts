import { layout, escapeHtml } from './layout';

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
          <div class="Box-header">
            <h2 class="Box-title">Posts</h2>
          </div>
          <div class="Box-body color-fg-muted">
            <p>${data.postsCount} posts</p>
            <a href="https://${escapeHtml(data.domain)}/users/${escapeHtml(data.handle)}/outbox" class="Link">View outbox (ActivityPub)</a>
          </div>
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
