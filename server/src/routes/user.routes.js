const router = require('express').Router();
const controller = require('../controllers/user.controller');
const { protect } = require('../middleware/auth');

// All user routes require authentication
router.use(protect);

// GET /api/users/me
router.get('/me', controller.getMe);

// PATCH /api/users/me
router.patch('/me', controller.updateMe);

// POST /api/users/onboarding
router.post('/onboarding', controller.saveOnboarding);

// GET /api/users/credits
router.get('/credits', controller.getCredits);

module.exports = router;
