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
const HANDLE = process.env.HANDLE;

if (!ADMIN_TOKEN) {
  console.error('Error: ADMIN_TOKEN is required');
  console.error('Set it in .env file or as environment variable');
  process.exit(1);
}

const url = `https://${DOMAIN}/admin/publish`;

console.log('Publishing new posts to followers...');

fetch(url, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${ADMIN_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ handle: HANDLE }),
})
  .then(async (res) => {
    const data = await res.json();
    if (res.ok) {
      if (data.published === 0) {
        console.log('✓ No new posts to publish');
      } else {
        console.log(`✓ Published ${data.published} post(s)`);
        for (const post of data.posts || []) {
          console.log(`  - ${post.handle}/${post.id}`);
        }
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
