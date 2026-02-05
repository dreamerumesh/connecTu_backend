const express = require('express');
const router = express.Router();
const chatController = require('../controllers/chatController');
const { protect } = require('../middleware/authMiddleware');


//console.log('protect is:', protect);

// Get all chats for logged-in user (chat list)
router.get('/', protect, chatController.getMyChats);

// Get messages of a specific chat
router.get('/:chatId/messages', protect, chatController.getChatMessages);

// Send a message (create chat if not exists)
router.post('/send', protect, chatController.sendMessage);
// router.post('/send', protect, (req, res) => {
//   res.json({ ok: true });
// });

// Edit a message
router.put('/edit-message', protect, chatController.editMessage);


module.exports = router;
