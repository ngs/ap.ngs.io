import { layout, escapeHtml } from './layout';

interface PostPageData {
  handle: string;
  name: string;
  iconUrl: string | null;
  domain: string;
  postId: string;
  contentHtml: string;
  publishedAt: string;
  mediaUrls: string[];
}

export function postPage(data: PostPageData): string {
  const content = `
    <article class="Box">
      <div class="Box-header d-flex flex-items-center">
        <a href="https://${escapeHtml(data.domain)}/users/${escapeHtml(data.handle)}" class="d-flex flex-items-center Link--primary no-underline">
          ${data.iconUrl
            ? `<img src="${escapeHtml(data.iconUrl)}" alt="${escapeHtml(data.name)}" class="avatar avatar-small circle mr-2">`
            : `<div class="avatar avatar-small circle mr-2 color-bg-subtle d-flex flex-items-center flex-justify-center"><span>${escapeHtml(data.handle.charAt(0).toUpperCase())}</span></div>`
          }
          <div>
            <span class="text-bold">${escapeHtml(data.name)}</span>
            <span class="color-fg-muted ml-1">@${escapeHtml(data.handle)}@${escapeHtml(data.domain)}</span>
          </div>
        </a>
      </div>
      <div class="Box-body">
        <div class="mb-3">${data.contentHtml}</div>
        ${data.mediaUrls.length > 0 ? `
          <div class="d-flex flex-wrap gap-2 mb-3">
            ${data.mediaUrls.map(url => `
              <a href="${escapeHtml(url)}" target="_blank">
                <img src="${escapeHtml(url)}" alt="" class="rounded-2" style="max-width: 100%; max-height: 400px; object-fit: contain;">
              </a>
            `).join('')}
          </div>
        ` : ''}
        <div class="f6 color-fg-muted">
          <time datetime="${escapeHtml(data.publishedAt)}">${formatDate(data.publishedAt)}</time>
        </div>
      </div>
    </article>
  `;

  return layout(`Post by ${data.name} (@${data.handle}@${data.domain})`, content, data.domain);
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
