export function layout(title: string, content: string, domain: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-color-mode="auto" data-light-theme="light" data-dark-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <link href="https://unpkg.com/@primer/css@21/dist/primer.css" rel="stylesheet" />
  <style>
    body { min-height: 100vh; display: flex; flex-direction: column; }
    main { flex: 1; }
    .avatar-large { width: 120px; height: 120px; }
    .header-image { width: 100%; height: 200px; object-fit: cover; }
  </style>
</head>
<body>
  <div class="Header">
    <div class="Header-item">
      <a href="https://${escapeHtml(domain)}/" class="Header-link f4 d-flex flex-items-center">
        <span>${escapeHtml(domain)}</span>
      </a>
    </div>
  </div>
  <main class="container-lg p-4">
    ${content}
  </main>
  <footer class="container-lg p-4 color-fg-muted text-center">
    <p>Powered by <a href="https://github.com/ngs/ap.ngs.io" class="Link">ActivityPub Personal Server</a></p>
  </footer>
</body>
</html>`;
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
