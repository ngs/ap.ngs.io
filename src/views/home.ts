import { layout, escapeHtml } from './layout';

interface AccountSummary {
  handle: string;
  name: string;
  iconUrl: string | null;
}

export function homePage(domain: string, accounts: AccountSummary[]): string {
  const content = `
    <div class="text-center mb-4">
      <h1 class="h2 mb-2">${escapeHtml(domain)}</h1>
      <p class="color-fg-muted">ActivityPub Personal Server</p>
    </div>

    <div class="Box">
      <div class="Box-header">
        <h2 class="Box-title">Accounts</h2>
      </div>
      ${accounts.length > 0
        ? accounts.map(account => `
          <div class="Box-row d-flex flex-items-center">
            ${account.iconUrl
              ? `<img src="${escapeHtml(account.iconUrl)}" alt="" class="avatar avatar-small circle mr-3">`
              : `<div class="avatar avatar-small circle mr-3 color-bg-subtle d-flex flex-items-center flex-justify-center"><span>${escapeHtml(account.handle.charAt(0).toUpperCase())}</span></div>`
            }
            <div class="flex-auto">
              <a href="https://${escapeHtml(domain)}/@${escapeHtml(account.handle)}" class="Link--primary text-bold">
                ${escapeHtml(account.name)}
              </a>
              <p class="color-fg-muted mb-0">@${escapeHtml(account.handle)}@${escapeHtml(domain)}</p>
            </div>
          </div>
        `).join('')
        : '<div class="Box-row color-fg-muted">No accounts yet</div>'
      }
    </div>
  `;

  return layout(domain, content, domain);
}
