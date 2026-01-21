import type { FC, PropsWithChildren } from "hono/jsx";
import { css } from "../../styles/css";
import { clientScript } from "../../client/bundle";

interface LayoutProps {
  title: string;
  domain: string;
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({
  title,
  domain,
  children,
}) => (
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>{title}</title>
      <style dangerouslySetInnerHTML={{ __html: css }} />
    </head>
    <body>
      <header class="site-header">
        <a href={`https://${domain}/`}>{domain}</a>
      </header>
      <main>{children}</main>
      <footer class="site-footer">
        <a href="https://github.com/ngs/ap.ngs.io">
          ActivityPub Personal Server
        </a>
      </footer>
      <div id="lightbox-container"></div>
      <script dangerouslySetInnerHTML={{ __html: clientScript }} />
    </body>
  </html>
);
