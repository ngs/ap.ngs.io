import { Env } from '../types';

export function getPrivateKey(env: Env, handle: string): string {
  const key = env[`PRIVATE_KEY_${handle}` as keyof Env] as string | undefined;
  if (!key) {
    throw new Error(`Private key not found for account: ${handle}`);
  }
  return key;
}

export function getKeyId(domain: string, handle: string): string {
  return `https://${domain}/users/${handle}#main-key`;
}
