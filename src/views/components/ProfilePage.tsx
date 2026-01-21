import type { FC } from "hono/jsx";
import { Layout } from "./Layout";

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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\n/g, "<br>")
    .replace(
      /(https?:\/\/[^\s<]+)/g,
      '<a href="$1" rel="nofollow noopener" target="_blank">$1</a>'
    );
};

const formatDate = (isoString: string): string => {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const ProfilePage: FC<ProfilePageProps> = (props) => (
  <Layout
    title={`${props.name} (@${props.handle}@${props.domain})`}
    domain={props.domain}
  >
    <div class="profile">
      {/* Header: Avatar + Info */}
      <header class="profile-header">
        {props.iconUrl ? (
          <img src={props.iconUrl} alt="" class="profile-avatar" />
        ) : (
          <span class="profile-avatar profile-avatar--placeholder">
            {props.handle.charAt(0).toUpperCase()}
          </span>
        )}
        <div class="profile-info">
          <h1 class="profile-name">{props.name}</h1>
          <p class="profile-handle">
            @{props.handle}@{props.domain}
          </p>
          <div class="profile-stats">
            <a href={`https://${props.domain}/users/${props.handle}/followers`}>
              <strong>{props.followersCount}</strong> followers
            </a>
            <a href={`https://${props.domain}/users/${props.handle}/following`}>
              <strong>{props.followingCount}</strong> following
            </a>
          </div>
        </div>
      </header>

      {/* Bio */}
      {props.summary && (
        <section
          class="profile-bio"
          dangerouslySetInnerHTML={{ __html: formatSummary(props.summary) }}
        />
      )}

      {/* Posts */}
      <section class="posts-section">
        <h2 class="posts-title">Posts</h2>
        {props.posts.length > 0 ? (
          <div class="posts-list">
            {props.posts.map((post) => (
              <article class="post-item">
                <div
                  class="post-item-content"
                  dangerouslySetInnerHTML={{ __html: post.contentHtml }}
                />
                {post.mediaUrls.length > 0 && (
                  <div class="post-item-media">
                    {post.mediaUrls.map((url) => (
                      <a href={url} data-lightbox>
                        <img src={url} alt="" loading="lazy" />
                      </a>
                    ))}
                  </div>
                )}
                <div class="post-item-meta">
                  <a
                    href={`https://${props.domain}/@${props.handle}/${post.id}`}
                  >
                    <time datetime={post.publishedAt}>{formatDate(post.publishedAt)}</time>
                  </a>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p class="empty-state">No posts yet</p>
        )}
      </section>
    </div>
  </Layout>
);
