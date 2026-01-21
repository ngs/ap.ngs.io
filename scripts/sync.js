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

if (!ADMIN_TOKEN) {
  console.error('Error: ADMIN_TOKEN is required');
  console.error('Set it in .env file or as environment variable');
  process.exit(1);
}

const args = process.argv.slice(2);
const direction = args.includes('--to-github') ? 'to_github' : 'from_github';

const url = `https://${DOMAIN}/admin/sync`;

console.log(`Syncing ${direction === 'to_github' ? 'D1 → GitHub' : 'GitHub → D1'}...`);

fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ direction }),
})
  .then(async (res) => {
    const data = await res.json();
    if (res.ok) {
      console.log(`✓ Synced ${data.synced} items`);
    } else {
      console.error(`✗ Error: ${data.error || res.statusText}`);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error(`✗ Error: ${err.message}`);
    process.exit(1);
  });
