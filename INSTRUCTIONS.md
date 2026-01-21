# ActivityPub Personal Server

A personal SNS server that uses GitHub as a data store (including posts and images) and implements full ActivityPub functionality with Cloudflare Workers + D1. Supports multiple accounts.

## Goals

- Fully interoperable with existing ActivityPub servers like Mastodon
- All posts, activities, and images stored in a GitHub repository (source of truth)
- Host multiple accounts on a single instance
- Private keys securely managed via GitHub Actions Secrets + Cloudflare Workers Secrets
- Nearly free to operate (Cloudflare free tier + GitHub free tier)

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite) - for caching and high-frequency data
- **Data Source / Storage**: GitHub Repository (posts, images, and all settings)
- **Secrets Management**: GitHub Actions Secrets → Cloudflare Workers Secrets
- **CI/CD**: GitHub Actions

---

## Secrets Management

```
GitHub Actions Secrets
├── CLOUDFLARE_API_TOKEN
├── CLOUDFLARE_ACCOUNT_ID
├── ADMIN_TOKEN
├── ACCOUNT_{HANDLE}_PRIVATE_KEY   # Per-account private keys
└── ...

↓ Synced during deployment

Cloudflare Workers Secrets
├── GITHUB_TOKEN
├── ADMIN_TOKEN
├── PRIVATE_KEY_{handle}           # Per-account private keys
└── ...
```

### Naming Convention

- GitHub Secrets: `ACCOUNT_{HANDLE}_PRIVATE_KEY` (handle in uppercase)
- Workers Secrets: `PRIVATE_KEY_{handle}` (handle in lowercase)

---

## Architecture

```
GitHub Repository (source of truth)
├── accounts/
│   └── {handle}/
│       ├── profile.json
│       ├── public_key.pem
│       ├── posts/*.md
│       ├── media/*
│       └── data/
│           ├── followers.json
│           ├── following.json
│           └── received/*.json
└── .github/workflows/

Cloudflare Workers
├── ActivityPub endpoints
├── HTML pages (Primer CSS)
├── Image proxy
├── GitHub ↔ D1 sync
└── Admin API

Cloudflare D1
├── accounts
├── posts
├── followers
├── following
├── inbox_activities
└── delivery_queue
```

---

## URL Design

```
# WebFinger
GET /.well-known/webfinger?resource=acct:{handle}@{domain}

# NodeInfo
GET /.well-known/nodeinfo
GET /nodeinfo/2.1

# HTML Pages
GET /                              # Home (account list)
GET /@{handle}                     # Profile page
GET /users/{handle}                # Profile page / Actor (content negotiation)
GET /users/{handle}/followers      # Followers page / Collection
GET /users/{handle}/following      # Following page / Collection

# ActivityPub
POST /users/{handle}/inbox
GET  /users/{handle}/outbox

# Posts
GET /users/{handle}/posts/{id}
GET /users/{handle}/posts/{id}/activity

# Media
GET /media/{handle}/{filename}

# Admin API
POST /admin/sync
POST /admin/publish
POST /admin/follow
POST /admin/unfollow
GET  /admin/accounts
POST /admin/process-queue
```

---

## Data Repository Structure

```
{data-repo}/
├── accounts/
│   └── {handle}/
│       ├── profile.json
│       ├── public_key.pem
│       ├── posts/{ulid}.md
│       ├── media/{filename}
│       └── data/
│           ├── followers.json
│           ├── following.json
│           └── received/
│               ├── replies.json
│               ├── likes.json
│               └── boosts.json
└── .github/workflows/
    └── sync.yml
```

### profile.json

```json
{
  "name": "Display Name",
  "summary": "Bio here",
  "icon": "avatar.png",
  "image": "header.png",
  "manuallyApprovesFollowers": false,
  "discoverable": true
}
```

### posts/{ulid}.md

```markdown
---
published: "2025-01-22T10:00:00Z"
visibility: "public"
sensitive: false
---

Hello, Fediverse! #introduction

![photo](image.jpg)
```

---

## Important Notes

1. Never commit private keys to the GitHub repository
2. Be aware of GitHub API rate limits (5,000 req/hour)
3. Deliver activities sequentially (parallel delivery risks being blocked)
4. Use `rsa-sha256` for Mastodon compatibility
5. Cache Actor information appropriately
