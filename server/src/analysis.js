// Canonical DSA topics worth being solid in, keyed by LeetCode's tag slug
// (also used loosely to match against Codeforces tag names).
export const IMPORTANT_TOPICS = [
  { slug: 'array', name: 'Array' },
  { slug: 'string', name: 'String' },
  { slug: 'hash-table', name: 'Hash Table' },
  { slug: 'two-pointers', name: 'Two Pointers' },
  { slug: 'sliding-window', name: 'Sliding Window' },
  { slug: 'stack', name: 'Stack' },
  { slug: 'queue', name: 'Queue' },
  { slug: 'linked-list', name: 'Linked List' },
  { slug: 'binary-search', name: 'Binary Search' },
  { slug: 'sorting', name: 'Sorting' },
  { slug: 'recursion', name: 'Recursion' },
  { slug: 'divide-and-conquer', name: 'Divide and Conquer' },
  { slug: 'tree', name: 'Tree' },
  { slug: 'binary-tree', name: 'Binary Tree' },
  { slug: 'binary-search-tree', name: 'Binary Search Tree' },
  { slug: 'heap-priority-queue', name: 'Heap (Priority Queue)' },
  { slug: 'trie', name: 'Trie' },
  { slug: 'graph', name: 'Graph' },
  { slug: 'breadth-first-search', name: 'Breadth-First Search' },
  { slug: 'depth-first-search', name: 'Depth-First Search' },
  { slug: 'union-find', name: 'Union Find' },
  { slug: 'topological-sort', name: 'Topological Sort' },
  { slug: 'dynamic-programming', name: 'Dynamic Programming' },
  { slug: 'greedy', name: 'Greedy' },
  { slug: 'backtracking', name: 'Backtracking' },
  { slug: 'bit-manipulation', name: 'Bit Manipulation' },
  { slug: 'math', name: 'Math' },
  { slug: 'matrix', name: 'Matrix' },
];

function normalizeTagName(name) {
  return name.trim().toLowerCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ');
}

export function getTopicAnalysis(solvedProblems) {
  const counts = new Map();
  for (const p of solvedProblems) {
    for (const tag of p.tags) {
      const key = normalizeTagName(tag);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const topics = IMPORTANT_TOPICS.map((t) => ({
    slug: t.slug,
    name: t.name,
    count: counts.get(normalizeTagName(t.name)) ?? 0,
  }));

  const allTags = [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalSolved: solvedProblems.length,
    importantTopics: topics.sort((a, b) => a.count - b.count),
    allTags,
  };
}

// Picks a topic to practice next: prefer important topics with the fewest
// solves (unsolved ones first), falling back to a random important topic if
// everything already has decent coverage.
export function pickWeakTopic(solvedProblems) {
  const { importantTopics } = getTopicAnalysis(solvedProblems);
  const unsolved = importantTopics.filter((t) => t.count === 0);
  const pool = unsolved.length > 0 ? unsolved : importantTopics.slice(0, 8);
  return pool[Math.floor(Math.random() * pool.length)];
}
