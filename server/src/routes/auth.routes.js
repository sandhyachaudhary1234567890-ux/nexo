const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');

// POST /api/auth/register
router.post('/register', controller.register);

// POST /api/auth/login
router.post('/login', controller.login);

// POST /api/auth/google
router.post('/google', controller.googleAuth);

// POST /api/auth/refresh
router.post('/refresh', controller.refresh);

// POST /api/auth/logout
router.post('/logout', protect, controller.logout);

module.exports = router;
