#!/usr/bin/env node
import { execSync } from 'child_process';

const sh = (cmd, inherit = false) =>
  execSync(cmd, {
    stdio: inherit ? 'inherit' : 'pipe',
    encoding: 'utf8',
    shell: true,
  }).trim();

console.log('🔍 Checking Redis (drivechat-redis-test)...');

const isRunning = sh(
  'docker ps --filter "name=^/drivechat-redis-test$" --filter "status=running" --format "{{.Names}}"'
);

if (isRunning) {
  console.log('✅ Redis already running');
} else {
  const exists = sh('docker ps -a --filter "name=^/drivechat-redis-test$" --format "{{.Names}}"');

  if (exists) {
    console.log('▶️ Starting existing Redis container...');
    sh('docker start drivechat-redis-test', true);
  } else {
    console.log('🆕 Creating Redis container...');
    sh('docker compose up -d redis', true);
  }
}

console.log('🚀 Starting dev processes...');
sh(
  'npx concurrently -k -n backend,frontend -c blue,green "npm run dev:backend" "npm run dev:frontend"',
  true
);
