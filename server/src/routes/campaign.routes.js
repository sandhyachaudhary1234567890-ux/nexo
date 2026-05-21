const router = require('express').Router();
const controller = require('../controllers/campaign.controller');
const { protect } = require('../middleware/auth');

// All campaign routes require authentication
router.use(protect);

// GET /api/campaigns — list campaigns with optional filters
router.get('/', controller.getCampaigns);

// POST /api/campaigns — create campaign
router.post('/', controller.createCampaign);

// GET /api/campaigns/:id — detail with stats
router.get('/:id', controller.getCampaign);

// PATCH /api/campaigns/:id — update (not if running)
router.patch('/:id', controller.updateCampaign);

// DELETE /api/campaigns/:id — only if draft/completed
router.delete('/:id', controller.deleteCampaign);

// POST /api/campaigns/:id/send — launch campaign
router.post('/:id/send', controller.sendCampaign);

// POST /api/campaigns/:id/pause — pause running campaign
router.post('/:id/pause', controller.pauseCampaign);

// GET /api/campaigns/:id/stats
router.get('/:id/stats', controller.getCampaignStats);

module.exports = router;
