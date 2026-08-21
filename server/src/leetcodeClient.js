const GRAPHQL_URL = 'https://leetcode.com/graphql';

function buildCookieHeader() {
  const session = process.env.LEETCODE_SESSION;
  const csrf = process.env.LEETCODE_CSRFTOKEN;
  if (!session || !csrf) {
    throw new Error('Not connected to LeetCode yet. Click "Connect LeetCode" in the sidebar.');
  }
  return { cookie: `LEETCODE_SESSION=${session}; csrftoken=${csrf}`, csrf };
}

async function gqlFetch(query, variables) {
  const { cookie, csrf } = buildCookieHeader();
  return rawGqlFetch(query, variables, { cookie, 'x-csrftoken': csrf });
}

// For public, unauthenticated reads (problem list, non-premium question content).
// Attaches the session cookie if one is configured, but doesn't require it.
async function publicGqlFetch(query, variables) {
  let headers = {};
  try {
    const { cookie, csrf } = buildCookieHeader();
    headers = { cookie, 'x-csrftoken': csrf };
  } catch {
    // Not logged in — fine, public queries work without it.
  }
  return rawGqlFetch(query, variables, headers);
}

async function rawGqlFetch(query, variables, extraHeaders) {
  const res = await fetch(GRAPHQL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      referer: 'https://leetcode.com',
      origin: 'https://leetcode.com',
      ...extraHeaders,
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`LeetCode GraphQL request failed: ${res.status} ${res.statusText}`);
  }
  const json = await res.json();
  if (json.errors?.length) {
    throw new Error(`LeetCode GraphQL error: ${json.errors.map((e) => e.message).join('; ')}`);
  }
  return json.data;
}

const SUBMISSION_LIST_QUERY = `
  query submissionList($offset: Int!, $limit: Int!, $lastKey: String) {
    submissionList(offset: $offset, limit: $limit, lastKey: $lastKey) {
      lastKey
      hasNext
      submissions {
        id
        statusDisplay
        lang
        timestamp
        titleSlug
        title
      }
    }
  }
`;

export async function fetchSubmissionPage(offset, limit, lastKey) {
  const data = await gqlFetch(SUBMISSION_LIST_QUERY, { offset, limit, lastKey: lastKey ?? null });
  return data.submissionList;
}

const SUBMISSION_DETAILS_QUERY = `
  query submissionDetails($submissionId: Int!) {
    submissionDetails(submissionId: $submissionId) {
      code
      lang {
        name
        verboseName
      }
      question {
        questionId
        title
        titleSlug
        content
        difficulty
        exampleTestcases
        sampleTestCase
        topicTags {
          name
        }
      }
    }
  }
`;

export async function fetchSubmissionDetails(submissionId) {
  const data = await gqlFetch(SUBMISSION_DETAILS_QUERY, { submissionId: Number(submissionId) });
  return data.submissionDetails;
}

// ---- Public (no login required) queries, for browsing any LeetCode problem ----

const QUESTION_LIST_QUERY = `
  query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
    problemsetQuestionList: questionList(
      categorySlug: $categorySlug
      limit: $limit
      skip: $skip
      filters: $filters
    ) {
      total: totalNum
      questions: data {
        questionFrontendId
        title
        titleSlug
        difficulty
        isPaidOnly
        topicTags {
          name
        }
      }
    }
  }
`;

export async function searchPublicQuestions(searchKeywords, limit = 15) {
  const data = await publicGqlFetch(QUESTION_LIST_QUERY, {
    categorySlug: '',
    limit,
    skip: 0,
    filters: searchKeywords ? { searchKeywords } : {},
  });
  return data.problemsetQuestionList.questions;
}

export async function fetchRandomPublicQuestion() {
  const countData = await publicGqlFetch(QUESTION_LIST_QUERY, {
    categorySlug: '',
    limit: 1,
    skip: 0,
    filters: {},
  });
  const total = countData.problemsetQuestionList.total;

  for (let attempt = 0; attempt < 5; attempt++) {
    const skip = Math.floor(Math.random() * total);
    const data = await publicGqlFetch(QUESTION_LIST_QUERY, {
      categorySlug: '',
      limit: 1,
      skip,
      filters: {},
    });
    const q = data.problemsetQuestionList.questions[0];
    if (q && !q.isPaidOnly) return q;
  }
  throw new Error('Could not find a free random question after several attempts');
}

const QUESTION_CONTENT_QUERY = `
  query questionContent($titleSlug: String!) {
    question(titleSlug: $titleSlug) {
      questionId
      title
      titleSlug
      content
      difficulty
      exampleTestcases
      sampleTestCase
      isPaidOnly
      topicTags {
        name
      }
    }
  }
`;

export async function fetchPublicQuestion(titleSlug) {
  const data = await publicGqlFetch(QUESTION_CONTENT_QUERY, { titleSlug });
  if (!data.question) {
    throw new Error(`No question found for slug "${titleSlug}"`);
  }
  if (data.question.isPaidOnly) {
    throw new Error(`"${data.question.title}" is a premium-only question and its content isn't public`);
  }
  return data.question;
}

const USER_STATUS_QUERY = `
  query globalData {
    userStatus {
      username
      isSignedIn
    }
  }
`;

// Whoever the configured session cookie belongs to — used to confirm a
// browser login actually worked and to show "connected as X" in the UI.
export async function fetchCurrentUsername() {
  const data = await gqlFetch(USER_STATUS_QUERY, {});
  if (!data.userStatus?.isSignedIn) return null;
  return data.userStatus.username;
}
