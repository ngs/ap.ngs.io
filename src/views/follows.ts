import { layout, escapeHtml } from './layout';

interface FollowUser {
  actorUrl: string;
  name?: string;
  preferredUsername?: string;
  iconUrl?: string;
  domain: string;
}

interface FollowsPageData {
  handle: string;
  name: string;
  domain: string;
  type: 'followers' | 'following';
  users: FollowUser[];
  totalCount: number;
  page: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export function followsPage(data: FollowsPageData): string {
  const title = data.type === 'followers' ? 'Followers' : 'Following';
  const baseUrl = `https://${data.domain}/users/${data.handle}/${data.type}`;

  const content = `
    <nav class="mb-3">
      <a href="https://${escapeHtml(data.domain)}/@${escapeHtml(data.handle)}" class="Link--secondary">
        &larr; Back to ${escapeHtml(data.name)}
      </a>
    </nav>

    <div class="Box">
      <div class="Box-header d-flex flex-items-center flex-justify-between">
        <h1 class="Box-title">${title}</h1>
        <span class="Counter">${data.totalCount}</span>
      </div>
      ${data.users.length > 0
        ? data.users.map(user => `
          <div class="Box-row d-flex flex-items-center">
            ${user.iconUrl
              ? `<img src="${escapeHtml(user.iconUrl)}" alt="" class="avatar avatar-small circle mr-3" loading="lazy">`
              : `<div class="avatar avatar-small circle mr-3 color-bg-subtle d-flex flex-items-center flex-justify-center">
                  <span>${escapeHtml((user.preferredUsername || '?').charAt(0).toUpperCase())}</span>
                </div>`
            }
            <div class="flex-auto overflow-hidden">
              <a href="${escapeHtml(user.actorUrl)}" class="Link--primary text-bold d-block text-truncate" rel="nofollow noopener" target="_blank">
                ${escapeHtml(user.name || user.preferredUsername || 'Unknown')}
              </a>
              <span class="color-fg-muted text-small d-block text-truncate">
                @${escapeHtml(user.preferredUsername || 'unknown')}@${escapeHtml(user.domain)}
              </span>
            </div>
            <a href="${escapeHtml(user.actorUrl)}" class="btn btn-sm" rel="nofollow noopener" target="_blank">
              View
            </a>
          </div>
        `).join('')
        : `<div class="Box-row color-fg-muted text-center py-4">
            No ${data.type} yet
          </div>`
      }
      ${(data.hasPrev || data.hasNext) ? `
        <div class="Box-footer d-flex flex-justify-between">
          ${data.hasPrev
            ? `<a href="${baseUrl}?page=${data.page - 1}" class="btn btn-sm">Previous</a>`
            : '<span></span>'
          }
          ${data.hasNext
            ? `<a href="${baseUrl}?page=${data.page + 1}" class="btn btn-sm">Next</a>`
            : '<span></span>'
          }
        </div>
      ` : ''}
    </div>
  `;

  return layout(`${title} - ${data.name} (@${data.handle}@${data.domain})`, content, data.domain);
}
