# ActivityPub Personal Server Implementation Guide

## Project Overview

A personal SNS server that uses GitHub as a data store (including posts and images) and implements full ActivityPub functionality with Cloudflare Workers + D1. Supports multiple accounts.

### Goals

- Fully interoperable with existing ActivityPub servers like Mastodon
- All posts, activities, and images stored in a GitHub repository (source of truth)
- Host multiple accounts on a single instance
- Private keys securely managed via GitHub Actions Secrets + Cloudflare Workers Secrets
- Nearly free to operate (Cloudflare free tier + GitHub free tier)

### Tech Stack

- **Runtime**: Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite) - for caching and high-frequency data
- **Data Source / Storage**: GitHub Repository (posts, images, and all settings)
- **Secrets Management**: GitHub Actions Secrets → Cloudflare Workers Secrets
- **CI/CD**: GitHub Actions

---

## Secrets Management Design

```
GitHub Actions Secrets (configuration location)
├── CLOUDFLARE_API_TOKEN          # For Workers deployment
├── CLOUDFLARE_ACCOUNT_ID
├── ADMIN_TOKEN                   # For admin API authentication
├── ACCOUNT_ngs_PRIVATE_KEY       # Private key for account ngs
├── ACCOUNT_alice_PRIVATE_KEY     # Private key for account alice
└── ...                           # Add secrets when adding accounts

↓ Synced during deployment via GitHub Actions

Cloudflare Workers Secrets (used at runtime)
├── GITHUB_TOKEN
├── ADMIN_TOKEN
├── PRIVATE_KEY_ngs               # Per-account private keys
├── PRIVATE_KEY_alice
└── ...
```

### Private Key Naming Convention

- GitHub Secrets: `ACCOUNT_{HANDLE}_PRIVATE_KEY` (handle in uppercase, hyphens become underscores)
- Workers Secrets: `PRIVATE_KEY_{handle}` (handle in lowercase)

---

## Architecture

```
GitHub Repository (source of truth, user-editable)
├── config.json                    # Server-wide settings
├── accounts/
│   ├── ngs/
│   │   ├── profile.json           # Profile
│   │   ├── public_key.pem         # Public key only (private key in Secrets)
│   │   ├── posts/
│   │   │   └── {ulid}.md          # Posts
│   │   ├── media/
│   │   │   └── {ulid}.{ext}       # Images/videos
│   │   └── data/
│   │       ├── followers.json
│   │       ├── following.json
│   │       └── received/
│   │           ├── replies.json
│   │           ├── likes.json
│   │           └── boosts.json
│   └── alice/
│       └── ... (same structure)
└── .github/workflows/
    ├── deploy.yml                 # Workers deployment + Secrets sync
    ├── publish.yml                # push → delivery trigger
    ├── sync.yml                   # D1 → GitHub periodic sync
    └── add-account.yml            # For adding new accounts

Cloudflare Workers
├── ActivityPub endpoints (per account)
├── Image proxy (GitHub raw → cached delivery)
├── GitHub → D1 sync
└── Admin API

Cloudflare D1
├── accounts (account list, public key cache)
├── posts (cache)
├── followers
├── following
├── inbox_activities
└── outbox_queue
```

---

## URL Design

```
# WebFinger
GET /.well-known/webfinger?resource=acct:{handle}@{domain}

# NodeInfo (server information)
GET /.well-known/nodeinfo
GET /nodeinfo/2.1

# Actor (per account)
GET  /users/{handle}
POST /users/{handle}/inbox
GET  /users/{handle}/outbox
GET  /users/{handle}/followers
GET  /users/{handle}/following

# Posts
GET /users/{handle}/posts/{id}
GET /users/{handle}/posts/{id}/activity    # Create Activity

# Images (GitHub proxy)
GET /media/{handle}/{filename}

# Admin API (requires ADMIN_TOKEN authentication)
POST /admin/sync                   # GitHub → D1 sync
POST /admin/publish                # Deliver new posts
GET  /admin/accounts               # Account list
```

---

## Phase 1: Project Setup

### 1.1 Directory Structure

```
activitypub-server/
├── src/
│   ├── index.ts                   # Entry point
│   ├── types.ts                   # Type definitions
│   ├── router.ts                  # Routing
│   ├── activitypub/
│   │   ├── webfinger.ts
│   │   ├── nodeinfo.ts
│   │   ├── actor.ts
│   │   ├── inbox.ts
│   │   ├── outbox.ts
│   │   ├── followers.ts
│   │   ├── following.ts
│   │   ├── note.ts
│   │   └── delivery.ts
│   ├── crypto/
│   │   ├── keys.ts                # Key retrieval (from Secrets)
│   │   └── http-signature.ts
│   ├── github/
│   │   ├── client.ts
│   │   ├── sync.ts
│   │   ├── parser.ts
│   │   └── media.ts               # Image proxy
│   ├── admin/
│   │   └── handlers.ts
│   └── utils/
│       ├── markdown.ts
│       ├── ulid.ts
│       └── response.ts
├── schema.sql
├── wrangler.toml
├── package.json
└── tsconfig.json
```

### 1.2 wrangler.toml

```toml
name = "activitypub-server"
main = "src/index.ts"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[[d1_databases]]
binding = "DB"
database_name = "activitypub"
database_id = "18ba18c4-56f1-4855-b1f4-32349de7ebff"

[vars]
DOMAIN = "example.com"
GITHUB_REPO = "username/activitypub-data"

# Secrets (set via wrangler secret put from GitHub Actions)
# GITHUB_TOKEN
# ADMIN_TOKEN
# PRIVATE_KEY_ngs
# PRIVATE_KEY_alice
# ... (per account)
```

### 1.3 D1 Schema (schema.sql)

```sql
-- Accounts (public information only, private keys in Workers Secrets)
CREATE TABLE IF NOT EXISTS accounts (
  handle TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  summary TEXT DEFAULT '',
  icon_url TEXT,
  image_url TEXT,
  public_key TEXT NOT NULL,
  manually_approves_followers INTEGER DEFAULT 0,
  discoverable INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Posts
CREATE TABLE IF NOT EXISTS posts (
  id TEXT NOT NULL,
  handle TEXT NOT NULL,
  content TEXT NOT NULL,
  content_html TEXT NOT NULL,
  published_at TEXT NOT NULL,
  in_reply_to TEXT,
  conversation TEXT,
  sensitive INTEGER DEFAULT 0,
  summary TEXT,
  media_urls TEXT,          -- JSON array of local URLs
  tags TEXT,                -- JSON array
  visibility TEXT DEFAULT 'public',  -- public, unlisted, followers, direct
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (handle, id)
);

-- Followers
CREATE TABLE IF NOT EXISTS followers (
  handle TEXT NOT NULL,
  actor_url TEXT NOT NULL,
  inbox_url TEXT NOT NULL,
  shared_inbox_url TEXT,
  actor_json TEXT,
  followed_at TEXT NOT NULL,
  PRIMARY KEY (handle, actor_url)
);

-- Following
CREATE TABLE IF NOT EXISTS following (
  handle TEXT NOT NULL,
  actor_url TEXT NOT NULL,
  inbox_url TEXT NOT NULL,
  accepted INTEGER DEFAULT 0,
  requested_at TEXT NOT NULL,
  accepted_at TEXT,
  PRIMARY KEY (handle, actor_url)
);

-- Received Activities
CREATE TABLE IF NOT EXISTS inbox_activities (
  id TEXT PRIMARY KEY,
  handle TEXT NOT NULL,
  type TEXT NOT NULL,
  actor_url TEXT NOT NULL,
  object_url TEXT,
  object_json TEXT,
  received_at TEXT NOT NULL,
  synced_to_github INTEGER DEFAULT 0
);

-- Delivery Queue (for retries)
CREATE TABLE IF NOT EXISTS delivery_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  handle TEXT NOT NULL,
  activity_json TEXT NOT NULL,
  target_inbox TEXT NOT NULL,
  attempts INTEGER DEFAULT 0,
  next_attempt_at TEXT NOT NULL,
  last_error TEXT,
  created_at TEXT NOT NULL
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_posts_handle_published ON posts(handle, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_followers_handle ON followers(handle);
CREATE INDEX IF NOT EXISTS idx_following_handle ON following(handle);
CREATE INDEX IF NOT EXISTS idx_inbox_handle_received ON inbox_activities(handle, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_inbox_not_synced ON inbox_activities(synced_to_github) WHERE synced_to_github = 0;
CREATE INDEX IF NOT EXISTS idx_delivery_next ON delivery_queue(next_attempt_at) WHERE attempts < 10;
```

---

## Phase 2: Type Definitions (src/types.ts)

```typescript
export interface Env {
  DB: D1Database;
  DOMAIN: string;
  GITHUB_REPO: string;
  GITHUB_TOKEN: string;
  ADMIN_TOKEN: string;
  // Dynamic reference: PRIVATE_KEY_{handle}
  [key: `PRIVATE_KEY_${string}`]: string | undefined;
}

// Helper to get account's private key
export function getPrivateKey(env: Env, handle: string): string {
  const key = env[`PRIVATE_KEY_${handle}` as keyof Env] as string | undefined;
  if (!key) {
    throw new Error(`Private key not found for account: ${handle}`);
  }
  return key;
}

export interface ServerConfig {
  domain: string;
  name: string;
  summary: string;
  adminEmail?: string;
}

export interface Account {
  handle: string;
  name: string;
  summary: string;
  iconUrl?: string;
  imageUrl?: string;
  publicKey: string;
  manuallyApprovesFollowers: boolean;
  discoverable: boolean;
  createdAt: string;
}

export interface Post {
  id: string;
  handle: string;
  content: string;
  contentHtml: string;
  publishedAt: string;
  inReplyTo?: string;
  conversation?: string;
  sensitive: boolean;
  summary?: string;
  mediaUrls: string[];
  tags: string[];
  visibility: 'public' | 'unlisted' | 'followers' | 'direct';
}

export interface Follower {
  handle: string;
  actorUrl: string;
  inboxUrl: string;
  sharedInboxUrl?: string;
  followedAt: string;
}

export interface Following {
  handle: string;
  actorUrl: string;
  inboxUrl: string;
  accepted: boolean;
  requestedAt: string;
  acceptedAt?: string;
}

export interface InboxActivity {
  id: string;
  handle: string;
  type: string;
  actorUrl: string;
  objectUrl?: string;
  objectJson?: string;
  receivedAt: string;
}

// ActivityPub Object Types
export interface APActor {
  '@context': string | string[];
  id: string;
  type: 'Person' | 'Service' | 'Application';
  preferredUsername: string;
  name: string;
  summary: string;
  url: string;
  inbox: string;
  outbox: string;
  followers: string;
  following: string;
  publicKey: {
    id: string;
    owner: string;
    publicKeyPem: string;
  };
  icon?: APImage;
  image?: APImage;
  manuallyApprovesFollowers?: boolean;
  discoverable?: boolean;
  published?: string;
  endpoints?: {
    sharedInbox?: string;
  };
}

export interface APImage {
  type: 'Image';
  mediaType: string;
  url: string;
}

export interface APNote {
  '@context': string | string[];
  id: string;
  type: 'Note';
  attributedTo: string;
  content: string;
  published: string;
  to: string[];
  cc: string[];
  inReplyTo?: string;
  conversation?: string;
  sensitive?: boolean;
  summary?: string;
  attachment?: APAttachment[];
  tag?: APTag[];
  url?: string;
}

export interface APAttachment {
  type: 'Document' | 'Image' | 'Video' | 'Audio';
  mediaType: string;
  url: string;
  name?: string;
}

export interface APTag {
  type: 'Hashtag' | 'Mention';
  href: string;
  name: string;
}

export interface APActivity {
  '@context': string | string[];
  id: string;
  type: string;
  actor: string;
  object?: string | APNote | APActivity;
  to?: string[];
  cc?: string[];
  published?: string;
}

export interface APCollection {
  '@context': string | string[];
  id: string;
  type: 'OrderedCollection' | 'Collection';
  totalItems: number;
  first?: string;
  orderedItems?: any[];
}
```

---

## Phase 3: Routing (src/router.ts)

```typescript
import { Env } from './types';
import { handleWebFinger } from './activitypub/webfinger';
import { handleNodeInfo, handleNodeInfoWellKnown } from './activitypub/nodeinfo';
import { handleActor } from './activitypub/actor';
import { handleInbox } from './activitypub/inbox';
import { handleOutbox } from './activitypub/outbox';
import { handleFollowers } from './activitypub/followers';
import { handleFollowing } from './activitypub/following';
import { handleNote, handleNoteActivity } from './activitypub/note';
import { handleMedia } from './github/media';
import { handleAdminSync, handleAdminPublish, handleAdminAccounts } from './admin/handlers';

export class Router {
  constructor(
    private env: Env,
    private ctx: ExecutionContext
  ) {}

  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
      return this.corsResponse();
    }

    try {
      // Well-known
      if (path === '/.well-known/webfinger') {
        return handleWebFinger(request, this.env);
      }
      if (path === '/.well-known/nodeinfo') {
        return handleNodeInfoWellKnown(this.env);
      }
      if (path === '/nodeinfo/2.1') {
        return handleNodeInfo(this.env);
      }

      // Media proxy
      const mediaMatch = path.match(/^\/media\/([^\/]+)\/(.+)$/);
      if (mediaMatch && method === 'GET') {
        return handleMedia(mediaMatch[1], mediaMatch[2], this.env);
      }

      // Actor routes
      const userMatch = path.match(/^\/users\/([^\/]+)(\/.*)?$/);
      if (userMatch) {
        const handle = userMatch[1];
        const subpath = userMatch[2] || '';

        // Check if account exists
        const account = await this.getAccount(handle);
        if (!account) {
          return this.notFound();
        }

        switch (subpath) {
          case '':
            if (method === 'GET') return handleActor(handle, this.env);
            break;
          case '/inbox':
            if (method === 'POST') return handleInbox(handle, request, this.env);
            break;
          case '/outbox':
            if (method === 'GET') return handleOutbox(handle, url, this.env);
            break;
          case '/followers':
            if (method === 'GET') return handleFollowers(handle, url, this.env);
            break;
          case '/following':
            if (method === 'GET') return handleFollowing(handle, url, this.env);
            break;
        }

        // Post routes: /users/{handle}/posts/{id}
        const postMatch = subpath.match(/^\/posts\/([^\/]+)(\/activity)?$/);
        if (postMatch && method === 'GET') {
          const postId = postMatch[1];
          const isActivity = !!postMatch[2];
          if (isActivity) {
            return handleNoteActivity(handle, postId, this.env);
          }
          return handleNote(handle, postId, this.env);
        }
      }

      // Admin routes
      if (path.startsWith('/admin/')) {
        if (!this.verifyAdminToken(request)) {
          return new Response('Unauthorized', { status: 401 });
        }

        if (path === '/admin/sync' && method === 'POST') {
          return handleAdminSync(request, this.env);
        }
        if (path === '/admin/publish' && method === 'POST') {
          return handleAdminPublish(request, this.env);
        }
        if (path === '/admin/accounts' && method === 'GET') {
          return handleAdminAccounts(this.env);
        }
      }

      return this.notFound();
    } catch (error) {
      console.error('Router error:', error);
      return new Response('Internal Server Error', { status: 500 });
    }
  }

  private async getAccount(handle: string): Promise<any> {
    const result = await this.env.DB.prepare(
      'SELECT * FROM accounts WHERE handle = ?'
    ).bind(handle).first();
    return result;
  }

  private verifyAdminToken(request: Request): boolean {
    const auth = request.headers.get('Authorization');
    if (!auth?.startsWith('Bearer ')) return false;
    const token = auth.slice(7);
    return token === this.env.ADMIN_TOKEN;
  }

  private corsResponse(): Response {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Accept, Authorization, Signature, Date, Host, Digest',
      },
    });
  }

  private notFound(): Response {
    return new Response('Not Found', { status: 404 });
  }
}
```

---

## Phase 4: ActivityPub Implementation

### 4.1 WebFinger (src/activitypub/webfinger.ts)

```typescript
import { Env } from '../types';

export async function handleWebFinger(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const resource = url.searchParams.get('resource');

  if (!resource?.startsWith('acct:')) {
    return new Response('Bad Request', { status: 400 });
  }

  const acct = resource.slice(5);
  const [handle, domain] = acct.split('@');

  if (domain !== env.DOMAIN) {
    return new Response('Not Found', { status: 404 });
  }

  const account = await env.DB.prepare(
    'SELECT handle FROM accounts WHERE handle = ?'
  ).bind(handle).first();

  if (!account) {
    return new Response('Not Found', { status: 404 });
  }

  const response = {
    subject: resource,
    aliases: [
      `https://${env.DOMAIN}/users/${handle}`,
      `https://${env.DOMAIN}/@${handle}`,
    ],
    links: [
      {
        rel: 'self',
        type: 'application/activity+json',
        href: `https://${env.DOMAIN}/users/${handle}`,
      },
      {
        rel: 'http://webfinger.net/rel/profile-page',
        type: 'text/html',
        href: `https://${env.DOMAIN}/@${handle}`,
      },
    ],
  };

  return new Response(JSON.stringify(response), {
    headers: {
      'Content-Type': 'application/jrd+json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'max-age=3600',
    },
  });
}
```

### 4.2 Actor (src/activitypub/actor.ts)

```typescript
import { Env, APActor } from '../types';

export async function handleActor(handle: string, env: Env): Promise<Response> {
  const account = await env.DB.prepare(
    'SELECT * FROM accounts WHERE handle = ?'
  ).bind(handle).first();

  if (!account) {
    return new Response('Not Found', { status: 404 });
  }

  const actor: APActor = {
    '@context': [
      'https://www.w3.org/ns/activitystreams',
      'https://w3id.org/security/v1',
      {
        'manuallyApprovesFollowers': 'as:manuallyApprovesFollowers',
        'discoverable': 'toot:discoverable',
        'toot': 'http://joinmastodon.org/ns#',
      },
    ],
    id: `https://${env.DOMAIN}/users/${handle}`,
    type: 'Person',
    preferredUsername: handle,
    name: account.name as string,
    summary: account.summary as string || '',
    url: `https://${env.DOMAIN}/@${handle}`,
    inbox: `https://${env.DOMAIN}/users/${handle}/inbox`,
    outbox: `https://${env.DOMAIN}/users/${handle}/outbox`,
    followers: `https://${env.DOMAIN}/users/${handle}/followers`,
    following: `https://${env.DOMAIN}/users/${handle}/following`,
    publicKey: {
      id: `https://${env.DOMAIN}/users/${handle}#main-key`,
      owner: `https://${env.DOMAIN}/users/${handle}`,
      publicKeyPem: account.public_key as string,
    },
    manuallyApprovesFollowers: account.manually_approves_followers === 1,
    discoverable: account.discoverable === 1,
    published: account.created_at as string,
    endpoints: {
      sharedInbox: `https://${env.DOMAIN}/inbox`,
    },
  };

  if (account.icon_url) {
    actor.icon = {
      type: 'Image',
      mediaType: 'image/png',
      url: account.icon_url as string,
    };
  }

  if (account.image_url) {
    actor.image = {
      type: 'Image',
      mediaType: 'image/png',
      url: account.image_url as string,
    };
  }

  return new Response(JSON.stringify(actor), {
    headers: {
      'Content-Type': 'application/activity+json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'max-age=300',
    },
  });
}
```

### 4.3 HTTP Signature (src/crypto/http-signature.ts)

```typescript
export interface SignatureVerification {
  valid: boolean;
  error?: string;
  keyId?: string;
}

export async function signRequest(
  targetUrl: string,
  method: string,
  body: string,
  privateKeyPem: string,
  keyId: string
): Promise<Headers> {
  const url = new URL(targetUrl);
  const date = new Date().toUTCString();

  // Digest
  const digestBuffer = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(body)
  );
  const digestBase64 = arrayBufferToBase64(digestBuffer);
  const digest = `SHA-256=${digestBase64}`;

  // Signing target
  const signedHeaders = '(request-target) host date digest content-type';
  const signedString = [
    `(request-target): ${method.toLowerCase()} ${url.pathname}`,
    `host: ${url.host}`,
    `date: ${date}`,
    `digest: ${digest}`,
    `content-type: application/activity+json`,
  ].join('\n');

  // Sign
  const privateKey = await importPrivateKey(privateKeyPem);
  const signatureBuffer = await crypto.subtle.sign(
    { name: 'RSASSA-PKCS1-v1_5' },
    privateKey,
    new TextEncoder().encode(signedString)
  );
  const signatureBase64 = arrayBufferToBase64(signatureBuffer);

  const signatureHeader = [
    `keyId="${keyId}"`,
    `algorithm="rsa-sha256"`,
    `headers="${signedHeaders}"`,
    `signature="${signatureBase64}"`,
  ].join(',');

  return new Headers({
    'Host': url.host,
    'Date': date,
    'Digest': digest,
    'Content-Type': 'application/activity+json',
    'Accept': 'application/activity+json, application/ld+json',
    'Signature': signatureHeader,
  });
}

export async function verifyHttpSignature(request: Request): Promise<SignatureVerification> {
  const signatureHeader = request.headers.get('Signature');
  if (!signatureHeader) {
    return { valid: false, error: 'Missing Signature header' };
  }

  // Parse
  const params: Record<string, string> = {};
  for (const part of signatureHeader.split(',')) {
    const eqIndex = part.indexOf('=');
    if (eqIndex === -1) continue;
    const key = part.slice(0, eqIndex).trim();
    const value = part.slice(eqIndex + 1).trim().replace(/^"|"$/g, '');
    params[key] = value;
  }

  const { keyId, headers: signedHeaderNames, signature } = params;
  if (!keyId || !signedHeaderNames || !signature) {
    return { valid: false, error: 'Invalid Signature header format' };
  }

  // Fetch Actor's public key
  const actorUrl = keyId.split('#')[0];
  let publicKeyPem: string;

  try {
    const actorResponse = await fetch(actorUrl, {
      headers: { 'Accept': 'application/activity+json, application/ld+json' },
    });

    if (!actorResponse.ok) {
      return { valid: false, error: `Failed to fetch actor: ${actorResponse.status}` };
    }

    const actor = await actorResponse.json() as any;
    publicKeyPem = actor.publicKey?.publicKeyPem;

    if (!publicKeyPem) {
      return { valid: false, error: 'No public key found' };
    }
  } catch (e) {
    return { valid: false, error: `Actor fetch error: ${e}` };
  }

  // Reconstruct signed string
  const url = new URL(request.url);
  const headerNames = signedHeaderNames.split(' ');
  const signedParts: string[] = [];

  for (const name of headerNames) {
    if (name === '(request-target)') {
      signedParts.push(`(request-target): ${request.method.toLowerCase()} ${url.pathname}${url.search}`);
    } else {
      const value = request.headers.get(name);
      if (value === null) {
        return { valid: false, error: `Missing header: ${name}` };
      }
      signedParts.push(`${name}: ${value}`);
    }
  }

  const signedString = signedParts.join('\n');

  // Verify
  try {
    const publicKey = await importPublicKey(publicKeyPem);
    const signatureBytes = base64ToArrayBuffer(signature);

    const valid = await crypto.subtle.verify(
      { name: 'RSASSA-PKCS1-v1_5' },
      publicKey,
      signatureBytes,
      new TextEncoder().encode(signedString)
    );

    return { valid, keyId };
  } catch (e) {
    return { valid: false, error: `Verification error: ${e}` };
  }
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN (RSA )?PRIVATE KEY-----/, '')
    .replace(/-----END (RSA )?PRIVATE KEY-----/, '')
    .replace(/\s/g, '');

  const der = base64ToArrayBuffer(pemContents);

  return crypto.subtle.importKey(
    'pkcs8',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

async function importPublicKey(pem: string): Promise<CryptoKey> {
  const pemContents = pem
    .replace(/-----BEGIN PUBLIC KEY-----/, '')
    .replace(/-----END PUBLIC KEY-----/, '')
    .replace(/\s/g, '');

  const der = base64ToArrayBuffer(pemContents);

  return crypto.subtle.importKey(
    'spki',
    der,
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
```

### 4.4 Inbox (src/activitypub/inbox.ts)

```typescript
import { Env, getPrivateKey } from '../types';
import { verifyHttpSignature } from '../crypto/http-signature';
import { sendActivity } from './delivery';
import { ulid } from '../utils/ulid';

export async function handleInbox(
  handle: string,
  request: Request,
  env: Env
): Promise<Response> {
  // HTTP Signature verification
  const verification = await verifyHttpSignature(request);
  if (!verification.valid) {
    console.error('Signature verification failed:', verification.error);
    return new Response('Unauthorized: ' + verification.error, { status: 401 });
  }

  const activity = await request.json() as any;
  console.log(`[${handle}] Received:`, activity.type, 'from', activity.actor);

  try {
    switch (activity.type) {
      case 'Follow':
        return handleFollow(handle, activity, env);
      case 'Undo':
        return handleUndo(handle, activity, env);
      case 'Create':
        return handleCreate(handle, activity, env);
      case 'Update':
        return handleUpdate(handle, activity, env);
      case 'Delete':
        return handleDelete(handle, activity, env);
      case 'Like':
        return handleLike(handle, activity, env);
      case 'Announce':
        return handleAnnounce(handle, activity, env);
      case 'Accept':
        return handleAccept(handle, activity, env);
      case 'Reject':
        return handleReject(handle, activity, env);
      default:
        console.log(`[${handle}] Unknown activity type:`, activity.type);
        return accepted();
    }
  } catch (error) {
    console.error(`[${handle}] Inbox error:`, error);
    return new Response('Internal Server Error', { status: 500 });
  }
}

async function handleFollow(handle: string, activity: any, env: Env): Promise<Response> {
  const actorUrl = activity.actor;

  // Fetch Actor information
  const actorResponse = await fetch(actorUrl, {
    headers: { 'Accept': 'application/activity+json, application/ld+json' },
  });

  if (!actorResponse.ok) {
    return new Response('Bad Request', { status: 400 });
  }

  const actor = await actorResponse.json() as any;
  const inboxUrl = actor.inbox;
  const sharedInboxUrl = actor.endpoints?.sharedInbox || actor.sharedInbox;

  // Add to followers
  await env.DB.prepare(`
    INSERT OR REPLACE INTO followers
    (handle, actor_url, inbox_url, shared_inbox_url, actor_json, followed_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).bind(
    handle,
    actorUrl,
    inboxUrl,
    sharedInboxUrl || null,
    JSON.stringify(actor),
    new Date().toISOString()
  ).run();

  // Record received activity
  await recordActivity(handle, 'Follow', activity, env);

  // Send Accept
  const acceptActivity = {
    '@context': 'https://www.w3.org/ns/activitystreams',
    id: `https://${env.DOMAIN}/users/${handle}/activities/${ulid()}`,
    type: 'Accept',
    actor: `https://${env.DOMAIN}/users/${handle}`,
    object: activity,
  };

  await sendActivity(handle, acceptActivity, inboxUrl, env);

  return accepted();
}

async function handleUndo(handle: string, activity: any, env: Env): Promise<Response> {
  const object = activity.object;
  const objectType = typeof object === 'string' ? null : object?.type;

  if (objectType === 'Follow') {
    await env.DB.prepare(
      'DELETE FROM followers WHERE handle = ? AND actor_url = ?'
    ).bind(handle, activity.actor).run();
  } else if (objectType === 'Like' || objectType === 'Announce') {
    await env.DB.prepare(
      'DELETE FROM inbox_activities WHERE id = ?'
    ).bind(object.id).run();
  }

  return accepted();
}

async function handleCreate(handle: string, activity: any, env: Env): Promise<Response> {
  if (activity.object?.type === 'Note') {
    await recordActivity(handle, 'Create', activity, env);
  }
  return accepted();
}

async function handleUpdate(handle: string, activity: any, env: Env): Promise<Response> {
  if (activity.object?.type === 'Person') {
    await env.DB.prepare(`
      UPDATE followers SET actor_json = ? WHERE handle = ? AND actor_url = ?
    `).bind(JSON.stringify(activity.object), handle, activity.actor).run();
  }
  return accepted();
}

async function handleDelete(handle: string, activity: any, env: Env): Promise<Response> {
  const objectUrl = typeof activity.object === 'string'
    ? activity.object
    : activity.object?.id;

  if (objectUrl) {
    await env.DB.prepare(
      'DELETE FROM inbox_activities WHERE handle = ? AND object_url = ?'
    ).bind(handle, objectUrl).run();
  }
  return accepted();
}

async function handleLike(handle: string, activity: any, env: Env): Promise<Response> {
  await recordActivity(handle, 'Like', activity, env);
  return accepted();
}

async function handleAnnounce(handle: string, activity: any, env: Env): Promise<Response> {
  await recordActivity(handle, 'Announce', activity, env);
  return accepted();
}

async function handleAccept(handle: string, activity: any, env: Env): Promise<Response> {
  const object = activity.object;
  if (object?.type === 'Follow' || typeof object === 'string') {
    await env.DB.prepare(`
      UPDATE following SET accepted = 1, accepted_at = ?
      WHERE handle = ? AND actor_url = ?
    `).bind(new Date().toISOString(), handle, activity.actor).run();
  }
  return accepted();
}

async function handleReject(handle: string, activity: any, env: Env): Promise<Response> {
  await env.DB.prepare(
    'DELETE FROM following WHERE handle = ? AND actor_url = ?'
  ).bind(handle, activity.actor).run();
  return accepted();
}

async function recordActivity(handle: string, type: string, activity: any, env: Env): Promise<void> {
  const objectUrl = typeof activity.object === 'string'
    ? activity.object
    : activity.object?.id;

  await env.DB.prepare(`
    INSERT OR IGNORE INTO inbox_activities
    (id, handle, type, actor_url, object_url, object_json, received_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(
    activity.id || ulid(),
    handle,
    type,
    activity.actor,
    objectUrl || null,
    activity.object ? JSON.stringify(activity.object) : null,
    new Date().toISOString()
  ).run();
}

function accepted(): Response {
  return new Response('Accepted', { status: 202 });
}
```

### 4.5 Delivery (src/activitypub/delivery.ts)

```typescript
import { Env, getPrivateKey } from '../types';
import { signRequest } from '../crypto/http-signature';

export async function sendActivity(
  handle: string,
  activity: any,
  targetInbox: string,
  env: Env
): Promise<void> {
  const body = JSON.stringify(activity);
  const privateKey = getPrivateKey(env, handle);
  const keyId = `https://${env.DOMAIN}/users/${handle}#main-key`;

  const headers = await signRequest(targetInbox, 'POST', body, privateKey, keyId);

  try {
    const response = await fetch(targetInbox, {
      method: 'POST',
      headers,
      body,
    });

    if (!response.ok) {
      console.error(`Delivery failed to ${targetInbox}: ${response.status}`);
      throw new Error(`Delivery failed: ${response.status}`);
    }

    console.log(`Delivered to ${targetInbox}`);
  } catch (error) {
    console.error(`Delivery error to ${targetInbox}:`, error);
    await queueDelivery(handle, activity, targetInbox, env);
  }
}

export async function broadcastToFollowers(handle: string, activity: any, env: Env): Promise<void> {
  const { results } = await env.DB.prepare(`
    SELECT DISTINCT COALESCE(shared_inbox_url, inbox_url) as inbox
    FROM followers WHERE handle = ?
  `).bind(handle).all();

  const inboxes = new Set((results || []).map(r => r.inbox as string));
  console.log(`Broadcasting to ${inboxes.size} inboxes`);

  for (const inbox of inboxes) {
    await sendActivity(handle, activity, inbox, env);
  }
}

async function queueDelivery(handle: string, activity: any, targetInbox: string, env: Env): Promise<void> {
  const nextAttempt = new Date(Date.now() + 60000).toISOString();

  await env.DB.prepare(`
    INSERT INTO delivery_queue
    (handle, activity_json, target_inbox, next_attempt_at, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).bind(handle, JSON.stringify(activity), targetInbox, nextAttempt, new Date().toISOString()).run();
}
```

---

## Phase 5: GitHub Integration

### 5.1 Image Proxy (src/github/media.ts)

```typescript
import { Env } from '../types';

export async function handleMedia(handle: string, filename: string, env: Env): Promise<Response> {
  const [owner, repo] = env.GITHUB_REPO.split('/');
  const githubUrl = `https://raw.githubusercontent.com/${owner}/${repo}/main/accounts/${handle}/media/${filename}`;

  try {
    const response = await fetch(githubUrl, {
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'User-Agent': 'ActivityPub-Server',
      },
    });

    if (!response.ok) {
      return new Response('Not Found', { status: 404 });
    }

    const ext = filename.split('.').pop()?.toLowerCase();
    const contentTypes: Record<string, string> = {
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'mp4': 'video/mp4',
      'webm': 'video/webm',
    };
    const contentType = contentTypes[ext || ''] || 'application/octet-stream';

    return new Response(response.body, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error) {
    console.error('Media fetch error:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
```

### 5.2 Sync Processing (src/github/sync.ts)

```typescript
import { Env } from '../types';
import { parsePostMarkdown } from './parser';

const GITHUB_API = 'https://api.github.com';

export async function syncFromGitHub(env: Env, handle?: string): Promise<{ synced: number }> {
  const [owner, repo] = env.GITHUB_REPO.split('/');
  let synced = 0;

  const handles = handle ? [handle] : await listAccountHandles(env);

  for (const h of handles) {
    // profile.json
    const profile = await getGitHubFile(`accounts/${h}/profile.json`, env);
    if (profile) {
      const data = JSON.parse(profile.content);
      const publicKey = await getGitHubFile(`accounts/${h}/public_key.pem`, env);

      await env.DB.prepare(`
        INSERT OR REPLACE INTO accounts
        (handle, name, summary, icon_url, image_url, public_key,
         manually_approves_followers, discoverable, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?,
                COALESCE((SELECT created_at FROM accounts WHERE handle = ?), ?), ?)
      `).bind(
        h,
        data.name || h,
        data.summary || '',
        data.icon ? `https://${env.DOMAIN}/media/${h}/${data.icon}` : null,
        data.image ? `https://${env.DOMAIN}/media/${h}/${data.image}` : null,
        publicKey?.content || '',
        data.manuallyApprovesFollowers ? 1 : 0,
        data.discoverable !== false ? 1 : 0,
        h,
        new Date().toISOString(),
        new Date().toISOString()
      ).run();
      synced++;
    }

    // posts/*.md
    const postFiles = await listGitHubFiles(`accounts/${h}/posts`, env);
    for (const file of postFiles.filter(f => f.endsWith('.md'))) {
      const content = await getGitHubFile(`accounts/${h}/posts/${file}`, env);
      if (content) {
        const post = parsePostMarkdown(content.content, file, h, env.DOMAIN);

        await env.DB.prepare(`
          INSERT OR REPLACE INTO posts
          (id, handle, content, content_html, published_at, in_reply_to,
           conversation, sensitive, summary, media_urls, tags, visibility,
           created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                  COALESCE((SELECT created_at FROM posts WHERE handle = ? AND id = ?), ?), ?)
        `).bind(
          post.id,
          h,
          post.content,
          post.contentHtml,
          post.publishedAt,
          post.inReplyTo || null,
          post.conversation || null,
          post.sensitive ? 1 : 0,
          post.summary || null,
          JSON.stringify(post.mediaUrls),
          JSON.stringify(post.tags),
          post.visibility,
          h,
          post.id,
          new Date().toISOString(),
          new Date().toISOString()
        ).run();
        synced++;
      }
    }
  }

  return { synced };
}

export async function syncToGitHub(env: Env): Promise<{ synced: number }> {
  let synced = 0;
  const handles = await listAccountHandles(env);

  for (const handle of handles) {
    // Sync followers to GitHub
    const { results: followers } = await env.DB.prepare(`
      SELECT actor_url, inbox_url, shared_inbox_url, followed_at
      FROM followers WHERE handle = ?
    `).bind(handle).all();

    const followersJson = JSON.stringify(
      (followers || []).map(f => ({
        actorUrl: f.actor_url,
        inboxUrl: f.inbox_url,
        sharedInboxUrl: f.shared_inbox_url,
        followedAt: f.followed_at,
      })),
      null,
      2
    );

    await putGitHubFile(`accounts/${handle}/data/followers.json`, followersJson, 'Sync followers', env);
    synced++;

    // Sync unsynced received activities
    const { results: activities } = await env.DB.prepare(`
      SELECT * FROM inbox_activities
      WHERE handle = ? AND synced_to_github = 0
      ORDER BY received_at LIMIT 100
    `).bind(handle).all();

    if (activities && activities.length > 0) {
      const byType: Record<string, any[]> = {};

      for (const activity of activities) {
        const type = activity.type as string;
        if (!byType[type]) byType[type] = [];
        byType[type].push({
          id: activity.id,
          actorUrl: activity.actor_url,
          objectUrl: activity.object_url,
          receivedAt: activity.received_at,
        });

        await env.DB.prepare(
          'UPDATE inbox_activities SET synced_to_github = 1 WHERE id = ?'
        ).bind(activity.id).run();
      }

      const typeToFile: Record<string, string> = {
        'Create': 'replies.json',
        'Like': 'likes.json',
        'Announce': 'boosts.json',
      };

      for (const [type, items] of Object.entries(byType)) {
        const filename = typeToFile[type];
        if (!filename) continue;

        const path = `accounts/${handle}/data/received/${filename}`;
        const existing = await getGitHubFile(path, env);
        let allItems: any[] = existing ? JSON.parse(existing.content) : [];
        allItems.push(...items);

        await putGitHubFile(path, JSON.stringify(allItems, null, 2), `Sync ${type}`, env);
        synced++;
      }
    }
  }

  return { synced };
}

async function listAccountHandles(env: Env): Promise<string[]> {
  const { results } = await env.DB.prepare('SELECT handle FROM accounts').all();
  return (results || []).map(r => r.handle as string);
}

async function getGitHubFile(path: string, env: Env): Promise<{ content: string; sha: string } | null> {
  const [owner, repo] = env.GITHUB_REPO.split('/');
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ActivityPub-Server',
    },
  });

  if (!response.ok) {
    if (response.status === 404) return null;
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = await response.json() as any;
  const content = decodeBase64(data.content);
  return { content, sha: data.sha };
}

async function listGitHubFiles(path: string, env: Env): Promise<string[]> {
  const [owner, repo] = env.GITHUB_REPO.split('/');
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ActivityPub-Server',
    },
  });

  if (!response.ok) {
    if (response.status === 404) return [];
    throw new Error(`GitHub API error: ${response.status}`);
  }

  const data = await response.json() as any[];
  return data.filter(item => item.type === 'file').map(item => item.name);
}

async function putGitHubFile(path: string, content: string, message: string, env: Env): Promise<void> {
  const [owner, repo] = env.GITHUB_REPO.split('/');
  const url = `${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`;

  const existing = await getGitHubFile(path, env);
  const body: any = { message, content: encodeBase64(content) };
  if (existing) body.sha = existing.sha;

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'ActivityPub-Server',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`GitHub API error: ${response.status}`);
  }
}

function encodeBase64(str: string): string {
  return btoa(unescape(encodeURIComponent(str)));
}

function decodeBase64(str: string): string {
  return decodeURIComponent(escape(atob(str.replace(/\n/g, ''))));
}
```

---

## Phase 6: GitHub Actions

### .github/workflows/deploy.yml

```yaml
name: Deploy Workers

on:
  push:
    branches: [main]
    paths: ['src/**', 'wrangler.toml', 'package.json']
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - uses: cloudflare/wrangler-action@v3
        with:
          apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}
          accountId: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
          secrets: |
            GITHUB_TOKEN
            ADMIN_TOKEN
            PRIVATE_KEY_ngs
        env:
          GITHUB_TOKEN: ${{ secrets.GH_PAT }}
          ADMIN_TOKEN: ${{ secrets.ADMIN_TOKEN }}
          PRIVATE_KEY_ngs: ${{ secrets.ACCOUNT_ngs_PRIVATE_KEY }}
```

### .github/workflows/publish.yml

```yaml
name: Publish Posts

on:
  push:
    paths: ['accounts/*/posts/**', 'accounts/*/profile.json']
  workflow_dispatch:
    inputs:
      handle:
        description: 'Account handle to sync'
        required: false

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Get changed accounts
        id: changed
        run: |
          if [ -n "${{ github.event.inputs.handle }}" ]; then
            echo "handles=${{ github.event.inputs.handle }}" >> $GITHUB_OUTPUT
          else
            handles=$(git diff --name-only HEAD~1 HEAD -- 'accounts/*/posts/*.md' 'accounts/*/profile.json' | \
              sed -n 's|accounts/\([^/]*\)/.*|\1|p' | sort -u | tr '\n' ',' | sed 's/,$//')
            echo "handles=$handles" >> $GITHUB_OUTPUT
          fi

      - name: Trigger sync and publish
        if: steps.changed.outputs.handles != ''
        run: |
          IFS=',' read -ra HANDLES <<< "${{ steps.changed.outputs.handles }}"
          for handle in "${HANDLES[@]}"; do
            curl -X POST "https://${{ vars.DOMAIN }}/admin/sync" \
              -H "Authorization: Bearer ${{ secrets.ADMIN_TOKEN }}" \
              -H "Content-Type: application/json" \
              -d "{\"handle\": \"$handle\", \"direction\": \"from_github\"}"

            curl -X POST "https://${{ vars.DOMAIN }}/admin/publish" \
              -H "Authorization: Bearer ${{ secrets.ADMIN_TOKEN }}" \
              -H "Content-Type: application/json" \
              -d "{\"handle\": \"$handle\"}"
          done
```

### .github/workflows/sync.yml

```yaml
name: Sync Data

on:
  schedule:
    - cron: '0 * * * *'
  workflow_dispatch:

jobs:
  sync:
    runs-on: ubuntu-latest
    steps:
      - name: Sync D1 to GitHub
        run: |
          curl -X POST "https://${{ vars.DOMAIN }}/admin/sync" \
            -H "Authorization: Bearer ${{ secrets.ADMIN_TOKEN }}" \
            -H "Content-Type: application/json" \
            -d '{"direction": "to_github"}'
```

### .github/workflows/add-account.yml

```yaml
name: Add New Account

on:
  workflow_dispatch:
    inputs:
      handle:
        description: 'Account handle'
        required: true
      name:
        description: 'Display name'
        required: true

jobs:
  add-account:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate RSA key pair
        run: |
          mkdir -p accounts/${{ github.event.inputs.handle }}/{posts,media,data/received}
          openssl genrsa -out private_key.pem 2048
          openssl rsa -in private_key.pem -pubout -out accounts/${{ github.event.inputs.handle }}/public_key.pem
          echo "PRIVATE_KEY<<EOF" >> $GITHUB_ENV
          cat private_key.pem >> $GITHUB_ENV
          echo "EOF" >> $GITHUB_ENV
          rm private_key.pem

      - name: Create files
        run: |
          cat > accounts/${{ github.event.inputs.handle }}/profile.json << 'EOF'
          {
            "name": "${{ github.event.inputs.name }}",
            "summary": "",
            "icon": null,
            "image": null,
            "manuallyApprovesFollowers": false,
            "discoverable": true
          }
          EOF
          echo '[]' > accounts/${{ github.event.inputs.handle }}/data/followers.json
          echo '[]' > accounts/${{ github.event.inputs.handle }}/data/following.json
          echo '[]' > accounts/${{ github.event.inputs.handle }}/data/received/replies.json
          echo '[]' > accounts/${{ github.event.inputs.handle }}/data/received/likes.json
          echo '[]' > accounts/${{ github.event.inputs.handle }}/data/received/boosts.json

      - name: Commit
        run: |
          git config user.name "GitHub Actions"
          git config user.email "actions@github.com"
          git add accounts/${{ github.event.inputs.handle }}
          git commit -m "Add account: ${{ github.event.inputs.handle }}"
          git push

      - name: Output private key
        run: |
          echo "Add this as GitHub Secret: ACCOUNT_${{ github.event.inputs.handle }}_PRIVATE_KEY"
          echo "${{ env.PRIVATE_KEY }}"
```

---

## Phase 7: Data Repository Structure

```
activitypub-data/
├── config.json
├── accounts/
│   └── {handle}/
│       ├── profile.json
│       ├── public_key.pem
│       ├── posts/{ulid}.md
│       ├── media/{filename}
│       └── data/
│           ├── followers.json
│           ├── following.json
│           └── received/{replies,likes,boosts}.json
└── .github/workflows/
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
id: "01HQX123ABC"
published: "2025-01-22T10:00:00Z"
visibility: "public"
sensitive: false
---

Hello, Fediverse! #introduction

![photo](01HQX123-image.jpg)
```

---

## Implementation Checklist

- [ ] Create Wrangler project
- [ ] Apply D1 schema
- [ ] Type definitions and routing
- [ ] WebFinger / NodeInfo
- [ ] Actor endpoint
- [ ] HTTP Signature
- [ ] Inbox processing
- [ ] Delivery processing
- [ ] Outbox / Followers / Following
- [ ] Note endpoint
- [ ] GitHub sync
- [ ] Image proxy
- [ ] Admin API
- [ ] GitHub Actions

---

## Important Notes

1. Never commit private keys to the GitHub repository
2. Be aware of GitHub API rate limits (5,000 req/hour)
3. Deliver sequentially (parallel delivery risks being blocked)
4. Use `rsa-sha256` for Mastodon compatibility
5. Cache Actor information appropriately
