const Groq = require('groq-sdk');
const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const logger = require('../config/logger');

// ─── Initialize AI Clients with custom keys or fallback ───────────────────────
const getGroq = (customKey) => {
  const key = customKey?.trim() || process.env.GROQ_API_KEY;
  if (!key) throw new Error('Groq API Key not configured. Please configure it in Settings.');
  return new Groq({ apiKey: key });
};

const getOpenAI = (customKey) => {
  const key = customKey?.trim() || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('OpenAI API Key not configured. Please configure it in Settings.');
  return new OpenAI({ apiKey: key });
};

const getGemini = (customKey) => {
  const key = customKey?.trim() || process.env.GEMINI_API_KEY;
  if (!key) throw new Error('Google Gemini API Key not configured. Please configure it in Settings.');
  return new GoogleGenerativeAI(key);
};

// Helper to resolve provider dynamically based on BYOK configuration
const resolveActiveProvider = (requestedProvider, customKeys) => {
  const reqProv = (requestedProvider || 'groq').toLowerCase();
  
  const isConfigured = (p) => {
    if (p === 'openai') return !!(customKeys?.openaiKey?.trim() || process.env.OPENAI_API_KEY);
    if (p === 'gemini') return !!(customKeys?.geminiKey?.trim() || process.env.GEMINI_API_KEY);
    if (p === 'groq') return !!(customKeys?.groqKey?.trim() || process.env.GROQ_API_KEY);
    return false;
  };

  if (isConfigured(reqProv)) {
    return reqProv;
  }

  // Fallback to any custom key entered by the user
  if (customKeys?.groqKey?.trim() && isConfigured('groq')) return 'groq';
  if (customKeys?.openaiKey?.trim() && isConfigured('openai')) return 'openai';
  if (customKeys?.geminiKey?.trim() && isConfigured('gemini')) return 'gemini';

  // Fallback to system env keys if configured
  if (process.env.GROQ_API_KEY) return 'groq';
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.GEMINI_API_KEY) return 'gemini';

  return reqProv;
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

// ─── STREAM CHAT (SSE via multiple providers) ─────────────────────────────────
/**
 * Streams a chat response using Groq, OpenAI, or Gemini.
 * Writes SSE-formatted chunks to the Express response.
 *
 * @param {Array} messages - Array of { role, content } message objects
 * @param {Object} res - Express response object (SSE mode)
 * @param {string} taskType - Task type for model selection
 * @param {string} provider - 'groq', 'openai', or 'gemini'
 * @param {Object} customKeys - { groqKey, openaiKey, geminiKey }
 */
exports.streamChat = async (messages, res, taskType = 'chat', provider = 'groq', customKeys = {}) => {
  const prov = resolveActiveProvider(provider, customKeys);

  if (prov === 'openai') {
    const openai = getOpenAI(customKeys.openaiKey);
    const stream = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages,
      max_tokens: 2048,
      temperature: 0.7,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content;
      if (delta && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ content: delta, chunk: delta })}\n\n`);
      }
      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason && finishReason !== 'null') {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ done: true, finishReason })}\n\n`);
        }
        break;
      }
    }
  } else if (prov === 'gemini') {
    const genAI = getGemini(customKeys.geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const systemMessage = messages.find(m => m.role === 'system')?.content || '';
    const userMessages = messages.filter(m => m.role !== 'system').map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const chatSession = model.startChat({
      history: userMessages.slice(0, -1),
      systemInstruction: systemMessage
    });

    const lastMsg = userMessages[userMessages.length - 1]?.parts[0]?.text || '';
    const resultStream = await chatSession.sendMessageStream(lastMsg);

    for await (const chunk of resultStream.stream) {
      const text = chunk.text();
      if (text && !res.writableEnded) {
        res.write(`data: ${JSON.stringify({ content: text, chunk: text })}\n\n`);
      }
    }
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    }
  } else {
    // default groq
    const groq = getGroq(customKeys.groqKey);
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
        res.write(`data: ${JSON.stringify({ content: delta, chunk: delta })}\n\n`);
      }
      const finishReason = chunk.choices[0]?.finish_reason;
      if (finishReason && finishReason !== 'null') {
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ done: true, finishReason })}\n\n`);
        }
        break;
      }
    }
  }
};

// ─── ANALYZE (Groq/OpenAI/Gemini) ─────────────────────────────────────────────
/**
 * Analyzes lead/deal data.
 *
 * @param {string} type - Type of data: 'lead', 'deal', 'contact', 'campaign'
 * @param {Object} data - The data to analyze
 * @param {string} [question] - Optional specific question
 * @param {string} provider - 'groq', 'openai', or 'gemini'
 * @param {Object} customKeys - { groqKey, openaiKey, geminiKey }
 * @returns {Object} - { insights, recommendations, score, summary }
 */
exports.analyze = async (type, data, question, provider = 'groq', customKeys = {}) => {
  const prov = resolveActiveProvider(provider, customKeys);

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

  let content;

  if (prov === 'openai') {
    const openai = getOpenAI(customKeys.openaiKey);
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 1500,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });
    content = response.choices[0]?.message?.content;
  } else if (prov === 'gemini') {
    const genAI = getGemini(customKeys.geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const fullPrompt = `${systemPrompt}\n\n${userMessage}`;
    const result = await model.generateContent(fullPrompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    content = jsonMatch ? jsonMatch[0] : text;
  } else {
    // groq
    const groq = getGroq(customKeys.groqKey);
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
    content = response.choices[0]?.message?.content;
  }

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

// ─── GENERATE EMAIL DRAFT (Groq/OpenAI/Gemini) ───────────────────────────────
/**
 * Generates a personalized email draft.
 *
 * @param {Object} options
 * @param {Object} options.leadData - Lead information
 * @param {string} options.templateType - Type of email (cold_outreach, follow_up, etc.)
 * @param {string} options.tone - professional, casual, friendly, formal
 * @param {string} options.goal - What the email should achieve
 * @param {string} options.fromName - Sender name
 * @param {string} options.fromCompany - Sender company
 * @param {Object} options.additionalContext - Extra context
 * @param {string} options.provider - 'groq', 'openai', or 'gemini'
 * @param {Object} options.customKeys - Custom user keys
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
  provider = 'groq',
  customKeys = {},
}) => {
  const prov = resolveActiveProvider(provider, customKeys);

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

  let content;

  if (prov === 'openai') {
    const openai = getOpenAI(customKeys.openaiKey);
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 800,
      temperature: 0.8,
      response_format: { type: 'json_object' },
    });
    content = response.choices[0]?.message?.content;
  } else if (prov === 'gemini') {
    const genAI = getGemini(customKeys.geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;
    const result = await model.generateContent(fullPrompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    content = jsonMatch ? jsonMatch[0] : text;
  } else {
    // groq
    const groq = getGroq(customKeys.groqKey);
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
    content = response.choices[0]?.message?.content;
  }

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
 * @param {Object} customKeys - Custom user keys
 * @returns {Object} - Enriched data
 */
exports.enrichLeadData = async (leadData, customKeys = {}) => {
  const prov = resolveActiveProvider('gemini', customKeys);

  const systemPrompt = `You are a B2B research analyst. Enrich the provided lead/company data.
Return a JSON object with exactly these fields (use null if unknown):
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

Always respond with valid JSON only.`;

  const userMessage = `Lead Data: ${JSON.stringify(leadData)}`;

  let content;

  if (prov === 'openai') {
    const openai = getOpenAI(customKeys.openaiKey);
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 1500,
      temperature: 0.3,
      response_format: { type: 'json_object' },
    });
    content = response.choices[0]?.message?.content;
  } else if (prov === 'gemini') {
    const genAI = getGemini(customKeys.geminiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const fullPrompt = `${systemPrompt}\n\n${userMessage}`;
    const result = await model.generateContent(fullPrompt);
    const text = result.response.text().trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    content = jsonMatch ? jsonMatch[0] : text;
  } else {
    // groq
    const groq = getGroq(customKeys.groqKey);
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
    content = response.choices[0]?.message?.content;
  }

  try {
    const parsed = JSON.parse(content);
    return parsed;
  } catch (err) {
    logger.error('AI enrichment parsing error:', err.message);
    throw new Error(`Enrichment parse failed: ${err.message}`);
  }
};
