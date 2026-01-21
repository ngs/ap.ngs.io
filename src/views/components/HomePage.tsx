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
    <h1 class="h2 mb-4">{domain}</h1>
    <div class="Box">
      <div class="Box-header">
        <h2 class="Box-title">Accounts</h2>
      </div>
      {accounts.map(account => (
        <div class="Box-row d-flex flex-items-center">
          <a href={`https://${domain}/users/${account.handle}`} class="d-flex flex-items-center Link--primary no-underline">
            {account.iconUrl ? (
              <img src={account.iconUrl} alt={account.name} class="avatar avatar-small circle mr-3" />
            ) : (
              <div class="avatar avatar-small circle mr-3 color-bg-subtle d-flex flex-items-center flex-justify-center">
                <span>{account.handle.charAt(0).toUpperCase()}</span>
              </div>
            )}
            <div>
              <span class="text-bold">{account.name}</span>
              <span class="color-fg-muted ml-1">@{account.handle}@{domain}</span>
            </div>
          </a>
        </div>
      ))}
      {accounts.length === 0 && (
        <div class="Box-row color-fg-muted">
          <p>No accounts yet</p>
        </div>
      )}
    </div>
  </Layout>
);
