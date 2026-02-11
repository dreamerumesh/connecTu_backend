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

// create a new chat (optional, can be done implicitly when sending first message)
router.post('/create', protect, chatController.createChat);

// get contacts
router.get('/contacts', protect, chatController.getContacts);

// delete a message for me
router.delete('/delete-message', protect, chatController.deleteMessageForMe);

// delete a message for everyone
router.delete('/delete-message-for-everyone', protect, chatController.deleteMessageForEveryone);

// clear chat history
router.delete('/clear-chat', protect, chatController.clearChat);

module.exports = router;
