export type Source = 'own' | 'manual' | 'ai';

export interface ProblemSummary {
  slug: string;
  questionId: string | null;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  tags: string[];
  lang: string;
  submittedAt: number;
  source: Source;
}

export interface ProblemDetail extends ProblemSummary {
  contentHtml: string;
  sampleTestcase: string;
  exampleTestcases: string;
  code: string;
  syncedAt: number;
}

export interface SyncSummary {
  totalAccepted: number;
  updated: number;
  skipped: number;
}

export interface PublicQuestion {
  questionFrontendId: string;
  title: string;
  titleSlug: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  isPaidOnly: boolean;
  topicTags: { name: string }[];
}

export interface ActivityDay {
  date: string;
  count: number;
}

export interface ActivityData {
  series: ActivityDay[];
  currentStreak: number;
  longestStreak: number;
}

export interface AppConfig {
  aiEnabled: boolean;
}

export interface AuthStatus {
  connected: boolean;
  username: string | null;
}

export interface LoginState {
  status: 'idle' | 'waiting' | 'success' | 'error';
  message: string;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export function fetchConfig() {
  return fetch('/api/config').then((r) => json<AppConfig>(r));
}

export function fetchProblems(params: {
  difficulty?: string;
  tag?: string;
  q?: string;
  source?: 'own' | 'public' | '';
}) {
  const search = new URLSearchParams();
  if (params.difficulty) search.set('difficulty', params.difficulty);
  if (params.tag) search.set('tag', params.tag);
  if (params.q) search.set('q', params.q);
  if (params.source) search.set('source', params.source);
  return fetch(`/api/problems?${search}`).then((r) => json<ProblemSummary[]>(r));
}

export function fetchTags() {
  return fetch('/api/tags').then((r) => json<string[]>(r));
}

export function fetchProblem(slug: string) {
  return fetch(`/api/problems/${slug}`).then((r) => json<ProblemDetail>(r));
}

export function updateProblem(slug: string, fields: Partial<ProblemDetail>) {
  return fetch(`/api/problems/${slug}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(fields),
  }).then((r) => json<ProblemDetail>(r));
}

export function deleteProblem(slug: string) {
  return fetch(`/api/problems/${slug}`, { method: 'DELETE' });
}

export function triggerSync() {
  return fetch('/api/sync', { method: 'POST' }).then((r) => json<SyncSummary>(r));
}

export function searchLeetCode(q: string) {
  const search = new URLSearchParams({ q });
  return fetch(`/api/leetcode/search?${search}`).then((r) => json<PublicQuestion[]>(r));
}

export function fetchRandomLeetCode() {
  return fetch('/api/leetcode/random').then((r) => json<PublicQuestion>(r));
}

export function importProblem(params: { slug: string; generateSolution: boolean; language?: string }) {
  return fetch('/api/problems/import', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  }).then((r) => json<ProblemDetail>(r));
}

export function createManualProblem(params: {
  title: string;
  difficulty: string;
  tags: string[];
  contentHtml: string;
  code: string;
  lang: string;
}) {
  return fetch('/api/problems/manual', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(params),
  }).then((r) => json<ProblemDetail>(r));
}

export function pingActivity() {
  return fetch('/api/activity/ping', { method: 'POST' }).then((r) => json<ActivityData>(r));
}

export function fetchAuthStatus() {
  return fetch('/api/auth/status').then((r) => json<AuthStatus>(r));
}

export function startLogin() {
  return fetch('/api/auth/login', { method: 'POST' }).then((r) => json<LoginState>(r));
}

export function fetchLoginStatus() {
  return fetch('/api/auth/login/status').then((r) => json<LoginState>(r));
}

export function fetchActivity() {
  return fetch('/api/activity').then((r) => json<ActivityData>(r));
}
