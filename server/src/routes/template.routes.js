const router = require('express').Router();
const controller = require('../controllers/template.controller');
const { protect } = require('../middleware/auth');

// Public templates endpoint (no auth required)
// GET /api/templates/public
router.get('/public', controller.getPublicTemplates);

// All routes below require authentication
router.use(protect);

// GET /api/templates
router.get('/', controller.getTemplates);

// POST /api/templates
router.post('/', controller.createTemplate);

// GET /api/templates/:id
router.get('/:id', controller.getTemplate);

// PATCH /api/templates/:id
router.patch('/:id', controller.updateTemplate);

// DELETE /api/templates/:id
router.delete('/:id', controller.deleteTemplate);

module.exports = router;
