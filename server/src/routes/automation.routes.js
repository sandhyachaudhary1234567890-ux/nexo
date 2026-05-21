const router = require('express').Router();
const controller = require('../controllers/automation.controller');
const { protect } = require('../middleware/auth');

// All automation routes require authentication
router.use(protect);

// GET /api/automations — list automations
router.get('/', controller.getAutomations);

// POST /api/automations — create automation
router.post('/', controller.createAutomation);

// GET /api/automations/:id — automation detail
router.get('/:id', controller.getAutomation);

// PATCH /api/automations/:id — update automation
router.patch('/:id', controller.updateAutomation);

// DELETE /api/automations/:id — delete automation
router.delete('/:id', controller.deleteAutomation);

// PATCH /api/automations/:id/toggle — flip isActive boolean
router.patch('/:id/toggle', controller.toggleAutomation);

// POST /api/automations/:id/trigger — manually trigger
router.post('/:id/trigger', controller.triggerAutomation);

// GET /api/automations/:id/logs — audit logs
router.get('/:id/logs', controller.getAutomationLogs);

module.exports = router;
