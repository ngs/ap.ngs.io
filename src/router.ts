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
import { handleAdminSync, handleAdminPublish, handleAdminAccounts, handleAdminProcessQueue, handleAdminFollow, handleAdminUnfollow } from './admin/handlers';
import { handleHomePage, handleProfilePage, handleFollowersPage, handleFollowingPage, handlePostPage } from './views/render';
import { queueBackgroundSync } from './github/background-sync';
import { notFoundResponse, unauthorizedResponse, errorResponse } from './utils/response';

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
      // Home page
      if (path === '/' && method === 'GET') {
        return handleHomePage(this.env);
      }

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

      // Post permalink (@handle/postId)
      const atPostMatch = path.match(/^\/@([^\/]+)\/([^\/]+)$/);
      if (atPostMatch && method === 'GET') {
        const handle = atPostMatch[1];
        const postId = atPostMatch[2];
        const account = await this.getAccount(handle);
        if (!account) {
          return notFoundResponse();
        }
        if (this.wantsActivityPub(request)) {
          return handleNote(handle, postId, this.env);
        }
        return handlePostPage(handle, postId, this.env);
      }

      // Profile page (@handle)
      const atMatch = path.match(/^\/@([^\/]+)$/);
      if (atMatch && method === 'GET') {
        const handle = atMatch[1];
        const account = await this.getAccount(handle);
        if (!account) {
          return notFoundResponse();
        }
        if (this.wantsActivityPub(request)) {
          return handleActor(handle, this.env);
        }
        return handleProfilePage(handle, this.env);
      }

      // Actor routes
      const userMatch = path.match(/^\/users\/([^\/]+)(\/.*)?$/);
      if (userMatch) {
        const handle = userMatch[1];
        const subpath = userMatch[2] || '';

        // Check if account exists
        const account = await this.getAccount(handle);
        if (!account) {
          return notFoundResponse();
        }

        switch (subpath) {
          case '':
            if (method === 'GET') {
              if (this.wantsActivityPub(request)) {
                return handleActor(handle, this.env);
              }
              return handleProfilePage(handle, this.env);
            }
            break;
          case '/inbox':
            if (method === 'POST') {
              const response = await handleInbox(handle, request, this.env);
              // Queue background sync after receiving activities
              if (response.status === 202) {
                queueBackgroundSync(this.ctx, this.env);
              }
              return response;
            }
            break;
          case '/outbox':
            if (method === 'GET') return handleOutbox(handle, url, this.env);
            break;
          case '/followers':
            if (method === 'GET') {
              if (this.wantsActivityPub(request)) {
                return handleFollowers(handle, url, this.env);
              }
              return handleFollowersPage(handle, url, this.env);
            }
            break;
          case '/following':
            if (method === 'GET') {
              if (this.wantsActivityPub(request)) {
                return handleFollowing(handle, url, this.env);
              }
              return handleFollowingPage(handle, url, this.env);
            }
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
          return unauthorizedResponse();
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
        if (path === '/admin/process-queue' && method === 'POST') {
          return handleAdminProcessQueue(this.env);
        }
        if (path === '/admin/follow' && method === 'POST') {
          const response = await handleAdminFollow(request, this.env);
          queueBackgroundSync(this.ctx, this.env);
          return response;
        }
        if (path === '/admin/unfollow' && method === 'POST') {
          const response = await handleAdminUnfollow(request, this.env);
          queueBackgroundSync(this.ctx, this.env);
          return response;
        }
      }

      return notFoundResponse();
    } catch (error) {
      console.error('Router error:', error);
      return errorResponse('Internal Server Error');
    }
  }

  private async getAccount(handle: string): Promise<unknown> {
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

  private wantsActivityPub(request: Request): boolean {
    const accept = request.headers.get('Accept') || '';
    return accept.includes('application/activity+json') || accept.includes('application/ld+json');
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
}
