# ap.ngs.io

A personal ActivityPub server using GitHub as a data store, powered by Cloudflare Workers + D1.

## Overview

- Fully interoperable with existing ActivityPub servers like Mastodon
- All posts, images, and settings stored in a GitHub repository (source of truth)
- Private keys securely managed via GitHub Actions Secrets + Cloudflare Workers Secrets
- Nearly free to operate (Cloudflare free tier + GitHub free tier)

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite) - for caching and high-frequency data
- **Data Storage**: GitHub Repository ([ap.ngs.io-data](https://github.com/ngs/ap.ngs.io-data))
- **Framework**: Hono
- **CI/CD**: GitHub Actions

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment variables

Copy `.env.example` to `.env` and edit:

```bash
cp .env.example .env
```

```
ADMIN_TOKEN=your-secret-admin-token
GITHUB_TOKEN=ghp_xxxx
```

### 3. Initialize the database

```bash
# Local
npm run db:init

# Remote (production)
npm run db:init:remote
```

### 4. Start development server

```bash
npm run dev
```

### 5. Deploy

```bash
npm run deploy
```

## Operations

### Creating Posts

1. Create a Markdown file in `accounts/{handle}/posts/` in the data repository
2. Push to trigger GitHub Actions which automatically syncs and publishes
3. Post is delivered to followers

Or via CLI:

```bash
npm run new-post -- --account ngs --content "Hello, Fediverse!"
```

### Manual Sync

Sync from GitHub to D1:

```bash
npm run sync
```

### Publish Posts

Deliver unpublished posts to followers:

```bash
npm run publish
```

### Follow/Unfollow

```bash
# Follow
npm run follow -- --account ngs --target user@example.com

# Unfollow
npm run unfollow -- --account ngs --target user@example.com
```

## API Endpoints

### ActivityPub

| Endpoint | Description |
|---|---|
| `GET /.well-known/webfinger` | WebFinger |
| `GET /.well-known/nodeinfo` | NodeInfo discovery |
| `GET /nodeinfo/2.1` | NodeInfo |
| `GET /@{handle}` | Profile page (HTML) |
| `GET /users/{handle}` | Actor (ActivityPub) |
| `POST /users/{handle}/inbox` | Inbox |
| `GET /users/{handle}/outbox` | Outbox |
| `GET /users/{handle}/followers` | Followers collection |
| `GET /users/{handle}/following` | Following collection |
| `GET /users/{handle}/posts/{id}` | Post |

### Admin API

All admin APIs require `Authorization: Bearer {ADMIN_TOKEN}` header.

| Endpoint | Description |
|---|---|
| `POST /admin/sync` | GitHub ↔ D1 sync |
| `POST /admin/publish` | Publish unpublished posts |
| `POST /admin/follow` | Follow a user |
| `POST /admin/unfollow` | Unfollow a user |
| `GET /admin/accounts` | List accounts |
| `POST /admin/process-queue` | Process delivery queue |

## Data Repository Structure

See [ap.ngs.io-data](https://github.com/ngs/ap.ngs.io-data) for the data repository structure:

```
accounts/
└── {handle}/
    ├── profile.json      # Profile settings
    ├── public_key.pem    # Public key
    ├── posts/*.md        # Posts
    ├── media/*           # Media files
    └── data/
        ├── followers.json
        ├── following.json
        └── received/     # Received activities
```

### profile.json

```json
{
  "name": "Display Name",
  "summary": "Bio here",
  "icon": "avatar.jpg",
  "image": "header.jpg",
  "fields": [
    { "name": "Website", "value": "https://example.com" }
  ],
  "manuallyApprovesFollowers": false,
  "discoverable": true
}
```

### Post files (*.md)

```markdown
---
published: "2025-01-22T10:00:00Z"
visibility: "public"
---

Post content here #hashtag

![image](image.jpg)
```

## Secrets Management

```
GitHub Actions Secrets
├── CLOUDFLARE_API_TOKEN
├── CLOUDFLARE_ACCOUNT_ID
├── ADMIN_TOKEN
└── ACCOUNT_{HANDLE}_PRIVATE_KEY

↓ Synced during deployment

Cloudflare Workers Secrets
├── GITHUB_TOKEN
├── ADMIN_TOKEN
└── PRIVATE_KEY_{handle}
```

## Important Notes

- Never commit private keys to the GitHub repository
- Be aware of GitHub API rate limits (5,000 req/hour)
- Uses `rsa-sha256` for Mastodon compatibility
