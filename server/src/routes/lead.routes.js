const router = require('express').Router();
const controller = require('../controllers/lead.controller');
const { protect } = require('../middleware/auth');
const { upload } = require('../middleware/upload');

// All lead routes require authentication
router.use(protect);

// GET /api/leads — search, filter, paginate
router.get('/', controller.getLeads);

// POST /api/leads — create manual lead
router.post('/', controller.createLead);

// POST /api/leads/import — CSV upload
router.post('/import', upload.single('file'), controller.importCSV);

// POST /api/leads/search-external — Apollo API search
router.post('/search-external', controller.searchExternal);

// GET /api/leads/:id
router.get('/:id', controller.getLead);

// PATCH /api/leads/:id
router.patch('/:id', controller.updateLead);

// DELETE /api/leads/:id
router.delete('/:id', controller.deleteLead);

// POST /api/leads/:id/enrich — add to enrichment queue
router.post('/:id/enrich', controller.enrichLead);

module.exports = router;
