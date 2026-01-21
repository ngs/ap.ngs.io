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
  <Layout title={`Post by ${props.name} (@${props.handle}@${props.domain})`} domain={props.domain}>
    <article class="Box">
      <div class="Box-header d-flex flex-items-center">
        <a href={`https://${props.domain}/users/${props.handle}`} class="d-flex flex-items-center Link--primary no-underline">
          {props.iconUrl ? (
            <img src={props.iconUrl} alt={props.name} class="avatar avatar-small circle mr-2" />
          ) : (
            <div class="avatar avatar-small circle mr-2 color-bg-subtle d-flex flex-items-center flex-justify-center">
              <span>{props.handle.charAt(0).toUpperCase()}</span>
            </div>
          )}
          <div>
            <span class="text-bold">{props.name}</span>
            <span class="color-fg-muted ml-1">@{props.handle}@{props.domain}</span>
          </div>
        </a>
      </div>
      <div class="Box-body">
        <div class="mb-3" dangerouslySetInnerHTML={{ __html: props.contentHtml }} />
        {props.mediaUrls.length > 0 && (
          <div class="d-flex flex-wrap gap-2 mb-3">
            {props.mediaUrls.map(url => (
              <a href={url} target="_blank">
                <img src={url} alt="" class="rounded-2" style="max-width: 100%; max-height: 400px; object-fit: contain;" />
              </a>
            ))}
          </div>
        )}
        <div class="f6 color-fg-muted">
          <time datetime={props.publishedAt}>{formatDate(props.publishedAt)}</time>
        </div>
      </div>
    </article>
  </Layout>
);
