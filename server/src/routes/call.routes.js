const router = require('express').Router();
const controller = require('../controllers/call.controller');
const { protect } = require('../middleware/auth');

// All call routes require authentication
router.use(protect);

// POST /api/calls — create a call room
router.post('/', controller.createCall);

// GET /api/calls — list user's calls
router.get('/', controller.getCalls);

// GET /api/calls/:id — get call detail
router.get('/:id', controller.getCall);

// PATCH /api/calls/:id/end — end an active call
router.patch('/:id/end', controller.endCall);

// POST /api/calls/:id/transcript — add transcript entry
router.post('/:id/transcript', controller.addTranscript);

// GET /api/calls/:id/transcript — get full transcript
router.get('/:id/transcript', controller.getTranscript);

module.exports = router;
