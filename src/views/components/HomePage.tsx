import type { FC } from 'hono/jsx';
import { Layout } from './Layout';

interface Account {
  handle: string;
  name: string;
  iconUrl: string | null;
}

interface HomePageProps {
  domain: string;
  accounts: Account[];
}

export const HomePage: FC<HomePageProps> = ({ domain, accounts }) => (
  <Layout title={domain} domain={domain}>
    <h1 class="home-title">{domain}</h1>
    {accounts.length > 0 ? (
      <div class="accounts-list">
        {accounts.map(account => (
          <a href={`https://${domain}/@${account.handle}`} class="account-item">
            {account.iconUrl ? (
              <img src={account.iconUrl} alt="" class="account-avatar" />
            ) : (
              <span class="account-avatar account-avatar--placeholder">
                {account.handle.charAt(0).toUpperCase()}
              </span>
            )}
            <div>
              <div class="account-name">{account.name}</div>
              <div class="account-handle">@{account.handle}@{domain}</div>
            </div>
          </a>
        ))}
      </div>
    ) : (
      <p class="empty-state">No accounts yet</p>
    )}
  </Layout>
);
