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
  const title = props.type === 'followers' ? 'Followers' : 'Following';
  const baseUrl = `https://${props.domain}/users/${props.handle}/${props.type}`;

  return (
    <Layout title={`${title} - ${props.name}`} domain={props.domain}>
      <div class="follows-page">
        <header class="follows-header">
          <a href={`https://${props.domain}/@${props.handle}`} class="back-link">← {props.name}</a>
          <span class="follows-title">{title}</span>
          <span class="follows-count">{props.totalCount}</span>
        </header>

        {props.users.length > 0 ? (
          <div class="follows-list">
            {props.users.map(user => (
              <a href={user.actorUrl} class="follow-item" target="_blank" rel="noopener">
                {user.iconUrl ? (
                  <img src={user.iconUrl} alt="" class="follow-avatar" />
                ) : (
                  <span class="follow-avatar follow-avatar--placeholder">
                    {(user.preferredUsername || '?').charAt(0).toUpperCase()}
                  </span>
                )}
                <div class="follow-info">
                  <div class="follow-name">{user.name || user.preferredUsername || 'Unknown'}</div>
                  <div class="follow-handle">@{user.preferredUsername || 'unknown'}@{user.domain}</div>
                </div>
              </a>
            ))}
          </div>
        ) : (
          <p class="empty-state">No {props.type} yet</p>
        )}

        {(props.hasPrev || props.hasNext) && (
          <nav class="pagination">
            {props.hasPrev ? (
              <a href={`${baseUrl}?page=${props.page - 1}`}>← Previous</a>
            ) : <span />}
            {props.hasNext ? (
              <a href={`${baseUrl}?page=${props.page + 1}`}>Next →</a>
            ) : <span />}
          </nav>
        )}
      </div>
    </Layout>
  );
};
