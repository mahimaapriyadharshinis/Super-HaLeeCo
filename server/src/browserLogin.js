import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_PATH = path.join(__dirname, '..', '..', '.env');

// idle | waiting | success | error
let state = { status: 'idle', message: '' };

export function getLoginState() {
  return state;
}

export function updateEnvFile(updates) {
  let content = '';
  try {
    content = fs.readFileSync(ENV_PATH, 'utf8');
  } catch {
    content = '';
  }
  const lines = content.length ? content.split('\n') : [];
  const seen = new Set();
  const newLines = lines.map((line) => {
    for (const key of Object.keys(updates)) {
      if (line.startsWith(`${key}=`)) {
        seen.add(key);
        return `${key}=${updates[key]}`;
      }
    }
    return line;
  });
  for (const key of Object.keys(updates)) {
    if (!seen.has(key)) newLines.push(`${key}=${updates[key]}`);
  }
  fs.writeFileSync(ENV_PATH, newLines.join('\n'));
}

const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_MS = 1000;

export function startBrowserLogin() {
  if (state.status === 'waiting') return state;
  state = {
    status: 'waiting',
    message: 'A browser window opened — log in to LeetCode there. This app never sees your password.',
  };

  (async () => {
    let browser;
    try {
      browser = await chromium.launch({ headless: false });
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto('https://leetcode.com/accounts/login/', { waitUntil: 'load' });

      const deadline = Date.now() + LOGIN_TIMEOUT_MS;
      let session, csrf;
      while (Date.now() < deadline) {
        if (!browser.isConnected()) {
          throw new Error('Browser window was closed before login finished. Click Connect to try again.');
        }
        const cookies = await context.cookies('https://leetcode.com');
        session = cookies.find((c) => c.name === 'LEETCODE_SESSION')?.value;
        csrf = cookies.find((c) => c.name === 'csrftoken')?.value;
        if (session && csrf) break;
        await new Promise((r) => setTimeout(r, POLL_MS));
      }

      if (!session || !csrf) {
        throw new Error('Timed out waiting for login (5 min). Click Connect to try again.');
      }

      process.env.LEETCODE_SESSION = session;
      process.env.LEETCODE_CSRFTOKEN = csrf;
      updateEnvFile({ LEETCODE_SESSION: session, LEETCODE_CSRFTOKEN: csrf });

      state = { status: 'success', message: 'Logged in.' };
    } catch (err) {
      let message = err.message;
      if (message.includes('Executable doesn\'t exist')) {
        message = 'Browser not installed yet. Run "npm run setup:browser" once, then try again.';
      }
      state = { status: 'error', message };
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  })();

  return state;
}
