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

export async function generateSolution({ title, contentHtml, difficulty, language }) {
  if (!aiEnabled()) {
    throw new Error('GEMINI_API_KEY is not set in .env — AI generation is disabled.');
  }
  const questionText = htmlToText(contentHtml);

  const response = await getClient().models.generateContent({
    model: 'gemini-2.5-flash',
    contents: `Problem: ${title} (${difficulty})\n\n${questionText}\n\nWrite a solution in ${language}.`,
    config: {
      systemInstruction:
        'You write correct, efficient, idiomatic solutions to LeetCode problems. ' +
        'Respond with ONLY the solution code in the requested language, no prose, ' +
        'no markdown fences, no explanation before or after the code. ' +
        'You may include brief inline comments only where the logic is non-obvious.',
    },
  });

  let code = (response.text ?? '').trim();
  code = code
    .replace(/^```[a-zA-Z0-9]*\n?/, '')
    .replace(/```$/, '')
    .trim();
  return code;
}
