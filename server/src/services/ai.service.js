const Groq = require('groq-sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../config/logger');

// ─── Initialize AI Clients ────────────────────────────────────────────────────
let groqClient = null;
let openaiClient = null;
let geminiClient = null;

const getGroq = () => {
  if (!groqClient) {
    if (!process.env.GROQ_API_KEY) throw new Error('GROQ_API_KEY not configured');
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
};

const getOpenAI = () => {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY not configured');
    openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openaiClient;
};

const getGemini = () => {
  if (!geminiClient) {
    if (!process.env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not configured');
    geminiClient = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
  return geminiClient;
};

// ─── MODEL SELECTION BY TASK TYPE ─────────────────────────────────────────────
const getModelForTask = (taskType) => {
  const models = {
    chat: 'llama-3.3-70b-versatile',
    analysis: 'llama-3.3-70b-versatile',
    draft: 'llama-3.1-8b-instant',
    enrich: 'llama-3.1-8b-instant',
  };
  return models[taskType] || models.chat;
};

// ─── STREAM CHAT (SSE via Groq) ───────────────────────────────────────────────
/**
 * Streams a chat response using Groq's streaming API.
 * Writes SSE-formatted chunks to the Express response.
 *
 * @param {Array} messages - Array of { role, content } message objects
 * @param {Object} res - Express response object (SSE mode)
 * @param {string} taskType - Task type for model selection
 */
exports.streamChat = async (messages, res, taskType = 'chat') => {
  const groq = getGroq();
  const model = getModelForTask(taskType);

  const stream = await groq.chat.completions.create({
    model,
    messages,
    max_tokens: 2048,
    temperature: 0.7,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content;
    if (delta && !res.writableEnded) {
      res.write(`data: ${JSON.stringify({ content: delta })}\n\n`);
    }

    // Check for finish reason
    const finishReason = chunk.choices[0]?.finish_reason;
    if (finishReason && finishReason !== 'null') {
      if (!res.writableEnded) {
        res.write(`data: ${JSON.stringify({ done: true, finishReason })}\n\n`);
      }
      break;
    }
  }
};

// ─── ANALYZE (OpenAI) ─────────────────────────────────────────────────────────
/**
 * Analyzes lead/deal data using OpenAI.
 *
 * @param {string} type - Type of data: 'lead', 'deal', 'contact', 'campaign'
 * @param {Object} data - The data to analyze
 * @param {string} [question] - Optional specific question
 * @returns {Object} - { insights, recommendations, score, summary }
 */
exports.analyze = async (type, data, question) => {
  const groq = getGroq(); // Use Groq for cost efficiency

  const systemPrompt = `You are Nexo AI, an expert B2B sales intelligence analyst. 
Analyze the provided ${type} data and return a structured JSON response with:
- summary: brief 2-3 sentence summary
- insights: array of key insights (max 5)
- recommendations: array of actionable next steps (max 5)
- score: overall quality/potential score 0-100
- riskFactors: array of potential risks or red flags
- opportunities: array of growth opportunities

Always respond with valid JSON only.`;

  const userMessage = question
    ? `Analyze this ${type} data and specifically answer: "${question}"\n\nData: ${JSON.stringify(data, null, 2)}`
    : `Analyze this ${type} data:\n\n${JSON.stringify(data, null, 2)}`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
    max_tokens: 1500,
    temperature: 0.3,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;

  try {
    return JSON.parse(content);
  } catch {
    return {
      summary: content,
      insights: [],
      recommendations: [],
      score: null,
      riskFactors: [],
      opportunities: [],
    };
  }
};

// ─── GENERATE EMAIL DRAFT ─────────────────────────────────────────────────────
/**
 * Generates a personalized email draft using Groq.
 *
 * @param {Object} options
 * @param {Object} options.leadData - Lead information
 * @param {string} options.templateType - Type of email (cold_outreach, follow_up, etc.)
 * @param {string} options.tone - professional, casual, friendly, formal
 * @param {string} options.goal - What the email should achieve
 * @param {string} options.fromName - Sender name
 * @param {string} options.fromCompany - Sender company
 * @param {Object} options.additionalContext - Extra context
 * @returns {{ subject: string, body: string, tone: string }}
 */
exports.generateEmailDraft = async ({
  leadData,
  templateType = 'cold_outreach',
  tone = 'professional',
  goal = 'schedule a meeting',
  fromName,
  fromCompany,
  additionalContext,
}) => {
  const groq = getGroq();

  const systemPrompt = `You are an expert B2B sales copywriter. Generate a highly personalized, compelling email for B2B outreach.
The email should feel genuine, not like a template. Avoid generic openers.
Return a JSON object with exactly two fields: "subject" (string) and "body" (string, plain text with \\n for line breaks).`;

  const userPrompt = `Generate a ${templateType} email with a ${tone} tone.

Goal: ${goal}
From: ${fromName}${fromCompany ? ` at ${fromCompany}` : ''}

Lead Details:
${JSON.stringify(leadData, null, 2)}

${additionalContext ? `Additional Context: ${JSON.stringify(additionalContext)}` : ''}

Requirements:
- Personalize based on the lead's company, industry, and role
- Keep it concise (under 150 words for body)
- Include a clear, specific call-to-action
- Don't use generic phrases like "I hope this email finds you well"
- Use {{firstName}} as a placeholder for personalization`;

  const response = await groq.chat.completions.create({
    model: 'llama-3.1-8b-instant',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 800,
    temperature: 0.8,
    response_format: { type: 'json_object' },
  });

  const content = response.choices[0]?.message?.content;

  try {
    const parsed = JSON.parse(content);
    return {
      subject: parsed.subject || 'Quick question',
      body: parsed.body || content,
      tone,
    };
  } catch {
    return {
      subject: 'Quick question about [Company]',
      body: content,
      tone,
    };
  }
};

// ─── ENRICH LEAD DATA (Gemini) ────────────────────────────────────────────────
/**
 * Enriches a lead using Google Gemini.
 * Returns structured enrichment data.
 *
 * @param {Object} leadData - Basic lead information
 * @returns {Object} - Enriched data
 */
exports.enrichLeadData = async (leadData) => {
  const genAI = getGemini();
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  const prompt = `You are a B2B research analyst. Enrich the following company/lead data.
Return a JSON object with these fields (use null if unknown):
{
  "companyDescription": string,
  "industry": string,
  "subIndustry": string,
  "founded": number,
  "headquarters": string,
  "employeeRange": string,
  "annualRevenueRange": string,
  "technologies": string[],
  "keyProducts": string[],
  "recentNews": string[],
  "socialProfiles": { "linkedin": string, "twitter": string, "facebook": string },
  "score": number (0-100, based on ICP fit for B2B SaaS),
  "enrichmentConfidence": number (0-1)
}

Lead Data: ${JSON.stringify(leadData)}

Return only valid JSON, no markdown.`;

  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(text);
  } catch (err) {
    logger.error('Gemini enrichment error:', err.message);
    throw new Error(`Enrichment failed: ${err.message}`);
  }
};
