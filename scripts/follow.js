#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Load .env file if exists
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim().replace(/^["']|["']$/g, '');
    }
  }
}

const DOMAIN = process.env.DOMAIN || 'ap.ngs.io';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN;
const HANDLE = process.env.HANDLE || 'ngs';

if (!ADMIN_TOKEN) {
  console.error('Error: ADMIN_TOKEN is required');
  console.error('Set it in .env file or as environment variable');
  process.exit(1);
}

const args = process.argv.slice(2);
const isUnfollow = args.includes('--unfollow');
const target = args.find(a => !a.startsWith('--'));

if (!target) {
  console.error(`Usage: npm run ${isUnfollow ? 'unfollow' : 'follow'} -- <target>`);
  console.error('');
  console.error('Examples:');
  console.error('  npm run follow -- user@mastodon.social');
  console.error('  npm run follow -- https://mastodon.social/users/user');
  console.error('  npm run unfollow -- user@mastodon.social');
  process.exit(1);
}

const endpoint = isUnfollow ? 'unfollow' : 'follow';
const url = `https://${DOMAIN}/admin/${endpoint}`;

fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ handle: HANDLE, target }),
})
  .then(async (res) => {
    const data = await res.json();
    if (res.ok) {
      console.log(`✓ ${isUnfollow ? 'Unfollow' : 'Follow'} request sent to ${target}`);
      if (data.actorId) {
        console.log(`  Actor: ${data.actorId}`);
      }
    } else {
      console.error(`✗ Error: ${data.error || res.statusText}`);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error(`✗ Error: ${err.message}`);
    process.exit(1);
  });
