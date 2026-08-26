import { GoogleGenAI } from '@google/genai';

// gemini-2.5-flash's free-tier daily quota is throttled down to as little as
// 20 requests/day on many accounts, and gemini-2.0-flash / gemini-2.5-flash-lite
// have since been retired for accounts created after their cutoff. Quota
// buckets are per-model, so gemini-3.5-flash-lite (a current, separate bucket)
// is used instead — verified live against this project's actual API key.
const MODEL = 'gemini-3.5-flash-lite';

let client = null;
export function aiEnabled() {
  return !!process.env.GEMINI_API_KEY;
}

function getClient() {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
}

// The SDK's error message is the raw API error body (a huge JSON blob) —
// not something to show a user. Translate the common, actionable case.
function friendlyAiError(err) {
  const raw = err?.message ?? String(err);
  if (raw.includes('RESOURCE_EXHAUSTED') || raw.includes('"code":429') || /quota/i.test(raw)) {
    return new Error(
      `Gemini's free daily quota for ${MODEL} is used up for now. Wait for it to reset, or set a different GEMINI_API_KEY in .env.`
    );
  }
  return err instanceof Error ? err : new Error(raw);
}

function htmlToText(html) {
  return (html || '')
    .replace(/<(br|\/p|\/li|\/div)\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const SYSTEM_INSTRUCTION =
  'You write correct, efficient, idiomatic solutions to competitive programming problems. ' +
  'Respond with ONLY the solution code in the requested language, no prose, ' +
  'no markdown fences, no explanation before or after the code. ' +
  'The code must contain ZERO comments of any kind: no "#", "//", "/* */", docstrings, ' +
  'or trailing end-of-line remarks. Do not explain what a line does, even briefly. ' +
  'If a name or step seems unclear, make the variable/function name itself clearer instead ' +
  'of adding a comment. A single comment character anywhere in the output is a failure.';

function stripFences(text) {
  return text
    .trim()
    .replace(/^```[a-zA-Z0-9]*\n?/, '')
    .replace(/```$/, '')
    .trim();
}

// Cheap heuristic — catches the common cases (a leading "#"/"//" line, or a
// trailing "  // ..." / "  # ..." remark) without risking false positives on
// strings that merely contain those characters mid-expression.
function looksCommented(code) {
  return /(^|\n)\s*(#|\/\/)/.test(code) || /\s{2,}(#|\/\/)\s?\S/.test(code) || /\/\*[\s\S]*?\*\//.test(code);
}

export async function generateSolution({ title, contentHtml, difficulty, language }) {
  if (!aiEnabled()) {
    throw new Error('GEMINI_API_KEY is not set in .env — AI generation is disabled.');
  }
  const questionText = htmlToText(contentHtml);
  const prompt = `Problem: ${title} (${difficulty})\n\n${questionText}\n\nWrite a solution in ${language}.`;

  const client = getClient();
  try {
    let code = stripFences(
      (
        await client.models.generateContent({
          model: MODEL,
          contents: prompt,
          config: { systemInstruction: SYSTEM_INSTRUCTION },
        })
      ).text ?? ''
    );

    // One corrective pass if the model slipped a comment in anyway.
    if (looksCommented(code)) {
      const retry = await client.models.generateContent({
        model: MODEL,
        contents:
          `${prompt}\n\nYour previous answer had at least one comment in it:\n\n${code}\n\n` +
          'Rewrite it with every comment removed. Output only the code.',
        config: { systemInstruction: SYSTEM_INSTRUCTION },
      });
      code = stripFences(retry.text ?? '') || code;
    }

    return code;
  } catch (err) {
    throw friendlyAiError(err);
  }
}

const QUIZ_SYSTEM_INSTRUCTION =
  'You quiz software engineers on their understanding of a solution they already wrote, ' +
  'ahead of a technical interview. Ask exactly ONE hard multiple-choice question about the ' +
  'ALGORITHM or the CODE shown — e.g. its time/space complexity, why the approach is correct, ' +
  'an edge case it handles or misses, what pattern/technique it uses, or how it would need to ' +
  'change for a harder variant of the problem. Do not ask about syntax trivia. Provide exactly ' +
  'four answer options where only one is correct and the other three are plausible, specific, ' +
  'and not obviously wrong. Respond in exactly this format, nothing else:\n' +
  'QUESTION: <the question>\nA: <option A>\nB: <option B>\nC: <option C>\nD: <option D>\n' +
  'CORRECT: <A, B, C, or D>\nEXPLANATION: <1-3 sentences on why that option is correct>';

export async function generateQuizQuestion({ title, contentHtml, code, lang }) {
  if (!aiEnabled()) {
    throw new Error('GEMINI_API_KEY is not set in .env — quiz generation is disabled.');
  }
  const questionText = htmlToText(contentHtml);
  const prompt =
    `Problem: ${title}\n\n${questionText}\n\nThe solution, in ${lang}:\n\n${code}\n\n` +
    'Write one hard multiple-choice quiz question about this, following the required format.';

  let text;
  try {
    const response = await getClient().models.generateContent({
      model: MODEL,
      contents: prompt,
      config: { systemInstruction: QUIZ_SYSTEM_INSTRUCTION },
    });
    text = (response.text ?? '').trim();
  } catch (err) {
    throw friendlyAiError(err);
  }

  const match = text.match(
    /QUESTION:\s*([\s\S]*?)\s*A:\s*([\s\S]*?)\s*B:\s*([\s\S]*?)\s*C:\s*([\s\S]*?)\s*D:\s*([\s\S]*?)\s*CORRECT:\s*([ABCD])\s*EXPLANATION:\s*([\s\S]*)/i
  );
  if (!match) {
    throw new Error('Could not parse a multiple-choice quiz question from the model response.');
  }
  const [, question, a, b, c, d, correctLetter, explanation] = match;
  return {
    question: question.trim(),
    options: [a.trim(), b.trim(), c.trim(), d.trim()],
    correctIndex: 'ABCD'.indexOf(correctLetter.toUpperCase()),
    explanation: explanation.trim(),
  };
}
