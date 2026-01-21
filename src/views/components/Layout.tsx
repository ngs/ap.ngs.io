import type { FC, PropsWithChildren } from "hono/jsx";
import { css } from "../../styles/css";

interface LayoutProps {
  title: string;
  domain: string;
}

const lightboxScript = `
  document.addEventListener('DOMContentLoaded', function() {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');

    document.querySelectorAll('[data-lightbox]').forEach(function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        lightboxImg.src = this.href;
        lightbox.classList.add('is-open');
      });
    });

    lightbox.addEventListener('click', function() {
      lightbox.classList.remove('is-open');
      lightboxImg.src = '';
    });

    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        lightbox.classList.remove('is-open');
        lightboxImg.src = '';
      }
    });
  });
`;

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
      <div id="lightbox" class="lightbox">
        <span class="lightbox-close">&times;</span>
        <img id="lightbox-img" src="" alt="" />
      </div>
      <script dangerouslySetInnerHTML={{ __html: lightboxScript }} />
    </body>
  </html>
);
