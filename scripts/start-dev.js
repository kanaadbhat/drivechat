#!/usr/bin/env node
import { execSync } from 'child_process';

function run(cmd) {
  try {
    return execSync(cmd, { stdio: 'pipe', encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

function runInherit(cmd) {
  try {
    execSync(cmd, { stdio: 'inherit', shell: true });
    return true;
  } catch {
    console.error('Command failed:', cmd);
    return false;
  }
}

console.log('Checking Redis container (drivechat-redis)...');

let includeRedisInConcurrently = false;
const running = run(
  'docker ps --filter "name=drivechat-redis" --filter "status=running" --format "{{.Names}}"'
);
if (running) {
  console.log('Redis container is already running:', running);
  includeRedisInConcurrently = false;
} else {
  const exists = run(
    'docker ps -a --filter "name=drivechat-redis" --format "{{.Names}}\t{{.Status}}"'
  );
  if (exists) {
    console.log('Found existing container (not running). Starting it...');
    if (!runInherit('docker start drivechat-redis')) process.exit(1);
    includeRedisInConcurrently = false;
  } else {
    console.log('No existing container found. Creating/starting via docker-compose...');
    if (!runInherit('docker-compose up -d redis')) process.exit(1);
    includeRedisInConcurrently = true;
  }
}

console.log('Starting dev processes via concurrently...');
let startCmd;
if (includeRedisInConcurrently) {
  startCmd =
    'npx concurrently -k -n backend,frontend,redis -c blue,green,yellow "npm run dev:backend" "npm run dev:frontend" "npm run docker:up:redis"';
} else {
  startCmd =
    'npx concurrently -k -n backend,frontend -c blue,green "npm run dev:backend" "npm run dev:frontend"';
}
if (!runInherit(startCmd)) process.exit(1);
