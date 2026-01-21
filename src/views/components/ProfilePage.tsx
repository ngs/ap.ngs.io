import type { FC } from 'hono/jsx';
import { Layout } from './Layout';

interface Post {
  id: string;
  contentHtml: string;
  publishedAt: string;
  mediaUrls: string[];
}

interface ProfilePageProps {
  handle: string;
  name: string;
  summary: string;
  iconUrl: string | null;
  imageUrl: string | null;
  domain: string;
  followersCount: number;
  followingCount: number;
  postsCount: number;
  posts: Post[];
}

const formatSummary = (summary: string): string => {
  return summary
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\n/g, '<br>')
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" class="Link" rel="nofollow noopener" target="_blank">$1</a>'
    );
};

const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const ProfilePage: FC<ProfilePageProps> = (props) => (
  <Layout title={`${props.name} (@${props.handle}@${props.domain})`} domain={props.domain}>
    {props.imageUrl && (
      <img src={props.imageUrl} alt="" class="header-image rounded-2 mb-3" />
    )}
    <div class="d-flex flex-items-start flex-column flex-md-row gutter-md">
      <div class="col-12 col-md-3">
        {props.iconUrl ? (
          <img src={props.iconUrl} alt={props.name} class="avatar avatar-large circle mb-3" />
        ) : (
          <div class="avatar avatar-large circle mb-3 color-bg-subtle d-flex flex-items-center flex-justify-center">
            <span class="f1">{props.handle.charAt(0).toUpperCase()}</span>
          </div>
        )}
        <h1 class="h3 mb-1">{props.name}</h1>
        <p class="color-fg-muted mb-3">@{props.handle}@{props.domain}</p>
        <div class="d-flex gap-3 mb-3">
          <a href={`https://${props.domain}/users/${props.handle}/followers`} class="Link--secondary">
            <strong>{props.followersCount}</strong> followers
          </a>
          <a href={`https://${props.domain}/users/${props.handle}/following`} class="Link--secondary">
            <strong>{props.followingCount}</strong> following
          </a>
        </div>
      </div>
      <div class="col-12 col-md-9">
        <div class="Box p-3 mb-3">
          <p class="wb-break-word" dangerouslySetInnerHTML={{ __html: formatSummary(props.summary) }} />
        </div>
        <div class="Box">
          <div class="Box-header d-flex flex-items-center flex-justify-between">
            <h2 class="Box-title">Posts</h2>
            <span class="Counter">{props.postsCount}</span>
          </div>
          {props.posts.length > 0 ? props.posts.map(post => (
            <div class="Box-row">
              <div class="mb-2" dangerouslySetInnerHTML={{ __html: post.contentHtml }} />
              {post.mediaUrls.length > 0 && (
                <div class="d-flex flex-wrap gap-2 mb-2">
                  {post.mediaUrls.map(url => (
                    <a href={url} target="_blank">
                      <img src={url} alt="" class="rounded-2" style="max-width: 200px; max-height: 200px; object-fit: cover;" />
                    </a>
                  ))}
                </div>
              )}
              <div class="f6 color-fg-muted">
                <a href={`https://${props.domain}/@${props.handle}/${post.id}`} class="Link--secondary">
                  {formatDate(post.publishedAt)}
                </a>
              </div>
            </div>
          )) : (
            <div class="Box-row color-fg-muted">
              <p>No posts yet</p>
            </div>
          )}
        </div>
      </div>
    </div>
  </Layout>
);
