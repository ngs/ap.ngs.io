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
  '@context': string | string[] | (string | Record<string, string>)[];
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
  inReplyTo?: string | null;
  conversation?: string;
  sensitive?: boolean;
  summary?: string | null;
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
  orderedItems?: unknown[];
}

export interface APOrderedCollectionPage {
  '@context': string | string[];
  id: string;
  type: 'OrderedCollectionPage';
  partOf: string;
  orderedItems: unknown[];
  next?: string;
  prev?: string;
}
