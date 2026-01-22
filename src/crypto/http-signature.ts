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

export async function signGetRequest(
  targetUrl: string,
  privateKeyPem: string,
  keyId: string
): Promise<Headers> {
  const url = new URL(targetUrl);
  const date = new Date().toUTCString();

  // Signing target for GET (no digest or content-type)
  const signedHeaders = '(request-target) host date accept';
  const acceptHeader = 'application/activity+json, application/ld+json';
  const signedString = [
    `(request-target): get ${url.pathname}`,
    `host: ${url.host}`,
    `date: ${date}`,
    `accept: ${acceptHeader}`,
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
    'Accept': acceptHeader,
    'User-Agent': 'ActivityPub-Server/1.0',
    'Signature': signatureHeader,
  });
}

interface D1Database {
  prepare(query: string): {
    bind(...values: unknown[]): {
      first(): Promise<Record<string, unknown> | null>;
    };
  };
}

export async function verifyHttpSignature(
  request: Request,
  db?: D1Database
): Promise<SignatureVerification> {
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
  let publicKeyPem: string | null = null;

  // First, try to get from cache
  if (db) {
    try {
      const cached = await db.prepare(
        'SELECT public_key_pem FROM actor_cache WHERE actor_url = ?'
      ).bind(actorUrl).first();
      if (cached?.public_key_pem) {
        publicKeyPem = cached.public_key_pem as string;
      }
    } catch (e) {
      console.error('Actor cache lookup error:', e);
    }
  }

  // If not in cache, fetch from network
  if (!publicKeyPem) {
    try {
      const actorResponse = await fetch(actorUrl, {
        headers: { 'Accept': 'application/activity+json, application/ld+json' },
      });

      if (!actorResponse.ok) {
        return { valid: false, error: `Failed to fetch actor: ${actorResponse.status}` };
      }

      const actor = await actorResponse.json() as { publicKey?: { publicKeyPem?: string } };
      publicKeyPem = actor.publicKey?.publicKeyPem || null;
    } catch (e) {
      return { valid: false, error: `Actor fetch error: ${e}` };
    }
  }

  if (!publicKeyPem) {
    return { valid: false, error: 'No public key found' };
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
