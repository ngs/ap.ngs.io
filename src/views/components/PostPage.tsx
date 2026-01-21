import type { FC } from 'hono/jsx';
import { Layout } from './Layout';

interface PostPageProps {
  handle: string;
  name: string;
  iconUrl: string | null;
  domain: string;
  postId: string;
  contentHtml: string;
  publishedAt: string;
  mediaUrls: string[];
}

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

export const PostPage: FC<PostPageProps> = (props) => (
  <Layout title={`${props.name} on ${props.domain}`} domain={props.domain}>
    <article class="post-detail">
      {/* Author - secondary, compact */}
      <header class="post-author">
        <a href={`https://${props.domain}/@${props.handle}`} class="author-link">
          {props.iconUrl ? (
            <img src={props.iconUrl} alt="" class="author-avatar" />
          ) : (
            <span class="author-avatar author-avatar--placeholder">
              {props.handle.charAt(0).toUpperCase()}
            </span>
          )}
          <span class="author-name">{props.name}</span>
          <span class="author-handle">@{props.handle}@{props.domain}</span>
        </a>
      </header>

      {/* Content - primary */}
      <div class="post-content" dangerouslySetInnerHTML={{ __html: props.contentHtml }} />

      {/* Media - subordinate to content */}
      {props.mediaUrls.length > 0 && (
        <div class="post-media">
          {props.mediaUrls.map(url => (
            <a href={url} data-lightbox class="media-link">
              <img src={url} alt="" class="media-image" loading="lazy" />
            </a>
          ))}
        </div>
      )}

      {/* Meta - tertiary */}
      <footer class="post-meta">
        <time datetime={props.publishedAt}>{formatDate(props.publishedAt)}</time>
      </footer>
    </article>
  </Layout>
);
