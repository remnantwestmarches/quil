// Global test setup
import { beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

// Ensure test data directory exists
const testDataDir = path.resolve(process.cwd(), 'tests/data');
if (!fs.existsSync(testDataDir)) {
  fs.mkdirSync(testDataDir, { recursive: true });
}

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DISCORD_TOKEN = 'test-token-12345';
process.env.APP_ID = '123456789';
process.env.GUILD_ID = '987654321';

beforeAll(() => {
  console.log('🧪 Test suite starting...');
});

afterAll(() => {
  console.log('✅ Test suite complete');
});
