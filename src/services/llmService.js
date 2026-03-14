const Groq = require('groq-sdk');

const client = new Groq({ apiKey: process.env.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are an expert educational quiz creator. Given a passage of educational content, generate quiz questions for students.

Return ONLY a valid JSON array. Each element must be one of these types:

MCQ:
{ "question": "...", "type": "MCQ", "options": ["A","B","C","D"], "answer": "A", "difficulty": "easy|medium|hard" }

True/False:
{ "question": "...", "type": "TrueFalse", "options": ["True","False"], "answer": "True|False", "difficulty": "easy|medium|hard" }

Fill in the blank:
{ "question": "The ___ has three sides.", "type": "FillBlank", "options": [], "answer": "triangle", "difficulty": "easy|medium|hard" }

Rules:
- Generate at least 1 of each type per passage (3 questions minimum).
- difficulty must be one of: easy, medium, hard
- answer must exactly match one of the options (for MCQ/TrueFalse) or be the missing word (for FillBlank)
- Return ONLY the JSON array, no explanation, no markdown fences.`;

async function generateQuestionsForChunk(chunkText) {
  const response = await client.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Generate quiz questions from this educational content:\n\n${chunkText}` }
    ],
    temperature: 0.7,
    max_tokens: 1500
  });

  const raw = response.choices[0].message.content.trim();

  try {
    // Strip markdown code fences if LLM adds them anyway
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('[llmService] Failed to parse LLM response as JSON:', raw.slice(0, 200));
    return [];
  }
}

module.exports = { generateQuestionsForChunk };
