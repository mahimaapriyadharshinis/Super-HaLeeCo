const STORAGE_KEY = 'haleeco.geminiKey';

// Stored only in this browser's localStorage — never sent anywhere except as
// the x-gemini-key header on this same origin's own AI requests, and never
// persisted server-side. Lets a hosted demo offer AI features without every
// visitor sharing the deploy owner's Gemini quota.
export function getGeminiKey(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

export function setGeminiKey(key: string) {
  try {
    if (key) localStorage.setItem(STORAGE_KEY, key);
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (private browsing, disabled storage) — the
    // key just won't persist across reloads, not worth surfacing an error.
  }
}

export function geminiKeyHeaders(): Record<string, string> {
  const key = getGeminiKey();
  return key ? { 'x-gemini-key': key } : {};
}
