import { GoogleGenAI } from '@google/genai';

let client = null;
export function aiEnabled() {
  return !!process.env.GEMINI_API_KEY;
}

function getClient() {
  if (!client) client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  return client;
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
  let code = stripFences(
    (
      await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { systemInstruction: SYSTEM_INSTRUCTION },
      })
    ).text ?? ''
  );

  // One corrective pass if the model slipped a comment in anyway.
  if (looksCommented(code)) {
    const retry = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents:
        `${prompt}\n\nYour previous answer had at least one comment in it:\n\n${code}\n\n` +
        'Rewrite it with every comment removed. Output only the code.',
      config: { systemInstruction: SYSTEM_INSTRUCTION },
    });
    code = stripFences(retry.text ?? '') || code;
  }

  return code;
}
