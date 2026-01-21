// Simple ULID generator for Cloudflare Workers
const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ENCODING_LEN = ENCODING.length;
const TIME_LEN = 10;
const RANDOM_LEN = 16;

function randomChar(): string {
  const rand = Math.floor(Math.random() * ENCODING_LEN);
  return ENCODING[rand];
}

function encodeTime(now: number, len: number): string {
  let str = '';
  for (let i = len; i > 0; i--) {
    const mod = now % ENCODING_LEN;
    str = ENCODING[mod] + str;
    now = Math.floor(now / ENCODING_LEN);
  }
  return str;
}

export function ulid(): string {
  const now = Date.now();
  let str = encodeTime(now, TIME_LEN);
  for (let i = 0; i < RANDOM_LEN; i++) {
    str += randomChar();
  }
  return str;
}
