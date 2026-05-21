const router = require('express').Router();
const controller = require('../controllers/ai.controller');
const { protect } = require('../middleware/auth');

// All AI routes require authentication
router.use(protect);

// POST /api/ai/chat — SSE streaming chat (Groq)
router.post('/chat', controller.chat);

// POST /api/ai/analyze — analyze lead/deal data (OpenAI)
router.post('/analyze', controller.analyze);

// POST /api/ai/enrich — bulk enrich leads (Gemini)
router.post('/enrich', controller.enrich);

// POST /api/ai/draft — generate email draft
router.post('/draft', controller.draft);

// GET /api/ai/prompts — list user's saved prompts
router.get('/prompts', controller.getPrompts);

// POST /api/ai/prompts — create prompt
router.post('/prompts', controller.createPrompt);

// PATCH /api/ai/prompts/:id — update prompt
router.patch('/prompts/:id', controller.updatePrompt);

// DELETE /api/ai/prompts/:id — delete prompt
router.delete('/prompts/:id', controller.deletePrompt);

module.exports = router;
