const router = require('express').Router();
const controller = require('../controllers/analytics.controller');
const { protect } = require('../middleware/auth');

// All analytics routes require authentication
router.use(protect);

// GET /api/analytics/overview — dashboard overview stats
router.get('/overview', controller.getOverview);

// GET /api/analytics/leads — lead stats (by date, status, source)
router.get('/leads', controller.getLeadAnalytics);

// GET /api/analytics/outreach — campaign stats aggregation
router.get('/outreach', controller.getOutreachAnalytics);

// GET /api/analytics/revenue — deal values by stage, pipeline
router.get('/revenue', controller.getRevenueAnalytics);

module.exports = router;
