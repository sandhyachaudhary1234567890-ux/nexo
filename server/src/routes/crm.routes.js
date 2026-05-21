const router = require('express').Router();
const controller = require('../controllers/crm.controller');
const { protect } = require('../middleware/auth');

// All CRM routes require authentication
router.use(protect);

// ─── CONTACTS ───────────────────────────────────────────────────
// GET /api/crm/contacts
router.get('/contacts', controller.getContacts);

// POST /api/crm/contacts
router.post('/contacts', controller.createContact);

// GET /api/crm/contacts/:id
router.get('/contacts/:id', controller.getContact);

// PATCH /api/crm/contacts/:id
router.patch('/contacts/:id', controller.updateContact);

// DELETE /api/crm/contacts/:id
router.delete('/contacts/:id', controller.deleteContact);

// POST /api/crm/contacts/:id/activity
router.post('/contacts/:id/activity', controller.addContactActivity);

// ─── PIPELINES ──────────────────────────────────────────────────
// GET /api/crm/pipelines
router.get('/pipelines', controller.getPipelines);

// POST /api/crm/pipelines
router.post('/pipelines', controller.createPipeline);

// GET /api/crm/pipelines/:id
router.get('/pipelines/:id', controller.getPipeline);

// PATCH /api/crm/pipelines/:id
router.patch('/pipelines/:id', controller.updatePipeline);

// DELETE /api/crm/pipelines/:id
router.delete('/pipelines/:id', controller.deletePipeline);

// ─── DEALS ──────────────────────────────────────────────────────
// GET /api/crm/deals
router.get('/deals', controller.getDeals);

// POST /api/crm/deals
router.post('/deals', controller.createDeal);

// GET /api/crm/deals/:id
router.get('/deals/:id', controller.getDeal);

// PATCH /api/crm/deals/:id
router.patch('/deals/:id', controller.updateDeal);

// DELETE /api/crm/deals/:id
router.delete('/deals/:id', controller.deleteDeal);

module.exports = router;
