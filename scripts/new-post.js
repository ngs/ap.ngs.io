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

const DATA_REPO = process.env.DATA_REPO || path.join(__dirname, '..', '..', 'ap.ngs.io-data');
const HANDLE = process.env.HANDLE || 'ngs';

// Generate ULID-like ID
function generateId() {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 10).toUpperCase();
  return timestamp + random;
}

// Get current ISO timestamp
function getTimestamp() {
  return new Date().toISOString();
}

const id = generateId();
const postsDir = path.join(DATA_REPO, 'accounts', HANDLE, 'posts');
const filePath = path.join(postsDir, `${id}.md`);

// Ensure posts directory exists
if (!fs.existsSync(postsDir)) {
  fs.mkdirSync(postsDir, { recursive: true });
}

const template = `---
published: "${getTimestamp()}"
visibility: "public"
---

`;

fs.writeFileSync(filePath, template);

console.log(`✓ Created: ${filePath}`);
console.log('');
console.log('Edit the file and add your content.');
console.log('');
console.log('To add an image:');
console.log(`  1. Copy image to: ${path.join(DATA_REPO, 'accounts', HANDLE, 'media')}/`);
console.log('  2. Reference in post: ![alt text](filename.jpg)');
