import type { FC } from 'hono/jsx';
import { Layout } from './Layout';

interface User {
  actorUrl: string;
  name?: string;
  preferredUsername?: string;
  iconUrl?: string;
  domain: string;
}

interface FollowsPageProps {
  handle: string;
  name: string;
  domain: string;
  type: 'followers' | 'following';
  users: User[];
  totalCount: number;
  page: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export const FollowsPage: FC<FollowsPageProps> = (props) => {
  const title = props.type === 'followers'
    ? `Followers of ${props.name}`
    : `${props.name} is following`;
  const baseUrl = `https://${props.domain}/users/${props.handle}/${props.type}`;

  return (
    <Layout title={`${title} (@${props.handle}@${props.domain})`} domain={props.domain}>
      <div class="d-flex flex-items-center mb-4">
        <a href={`https://${props.domain}/users/${props.handle}`} class="Link--secondary mr-2">
          ← Back to profile
        </a>
      </div>
      <h1 class="h2 mb-4">{title}</h1>
      <div class="Box">
        <div class="Box-header d-flex flex-items-center flex-justify-between">
          <h2 class="Box-title">{props.type === 'followers' ? 'Followers' : 'Following'}</h2>
          <span class="Counter">{props.totalCount}</span>
        </div>
        {props.users.map(user => (
          <div class="Box-row d-flex flex-items-center">
            <a href={user.actorUrl} class="d-flex flex-items-center Link--primary no-underline" target="_blank" rel="noopener">
              {user.iconUrl ? (
                <img src={user.iconUrl} alt={user.name || user.preferredUsername || 'Unknown'} class="avatar avatar-small circle mr-3" />
              ) : (
                <div class="avatar avatar-small circle mr-3 color-bg-subtle d-flex flex-items-center flex-justify-center">
                  <span>{(user.preferredUsername || '?').charAt(0).toUpperCase()}</span>
                </div>
              )}
              <div>
                <span class="text-bold">{user.name || user.preferredUsername || 'Unknown'}</span>
                <span class="color-fg-muted ml-1">
                  @{user.preferredUsername || 'unknown'}@{user.domain}
                </span>
              </div>
            </a>
          </div>
        ))}
        {props.users.length === 0 && (
          <div class="Box-row color-fg-muted">
            <p>No {props.type} yet</p>
          </div>
        )}
      </div>
      {(props.hasPrev || props.hasNext) && (
        <div class="d-flex flex-justify-between mt-4">
          {props.hasPrev ? (
            <a href={`${baseUrl}?page=${props.page - 1}`} class="btn">← Previous</a>
          ) : (
            <span />
          )}
          {props.hasNext && (
            <a href={`${baseUrl}?page=${props.page + 1}`} class="btn">Next →</a>
          )}
        </div>
      )}
    </Layout>
  );
};
