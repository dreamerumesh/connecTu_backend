# conneTu - Database Models

MongoDB models for the conneTu chat application.

## Project Structure

```
models/
├── User.js          # User model with presence info
├── Chat.js          # Chat model for conversations
├── Message.js       # Message model with status tracking
├── Session.js       # Session model for auth tokens
├── index.js         # Export all models
├── db.js            # Database connection config
└── README.md        # This file
```

## Models Overview

### 1. User Model (`User.js`)
Stores user information and online presence.

**Fields:**
- `phone`: Unique phone number (10-15 digits)
- `name`: User's display name
- `profilePic`: Profile picture URL
- `about`: Status message (max 139 chars)
- `isOnline`: Online status boolean
- `lastSeen`: Last activity timestamp
- `settings.readReceipts`: Read receipt preference
- `createdAt`: Account creation date

### 2. Chat Model (`Chat.js`)
Represents a private conversation between two users.

**Fields:**
- `participants`: Array of 2 user IDs
- `lastMessage`: Object with text, sender, and time
- `updatedAt`: Last activity in chat

**Validation:** Ensures exactly 2 participants per chat.

### 3. Message Model (`Message.js`)
Individual messages with delivery tracking.

**Fields:**
- `chatId`: Reference to Chat
- `sender`: User ID of sender
- `receiver`: User ID of receiver
- `type`: Message type (text/image/video/audio/document)
- `content`: Message content
- `status`: sent/delivered/read
- `timestamps`: sentAt, deliveredAt, readAt

**Methods:**
- `markAsDelivered()`: Update status to delivered
- `markAsRead()`: Update status to read

### 4. Session Model (`Session.js`)
Manages authentication tokens.

**Fields:**
- `userId`: Reference to User
- `token`: JWT token string
- `createdAt`: Session creation time
- `expiresAt`: Session expiry time

**Features:**
- Auto-deletes expired sessions (TTL index)
- `isValid()` method to check validity

## Installation

```bash
npm install mongoose
```

## Usage

### 1. Setup Database Connection

```javascript
const connectDB = require('./models/db');

// Connect to MongoDB
connectDB();
```

### 2. Import Models

```javascript
const { User, Chat, Message, Session } = require('./models');

// Or import individually
const User = require('./models/User');
```

### 3. Example Usage

```javascript
// Create a new user
const newUser = await User.create({
  phone: '919876543210',
  name: 'Umesh',
  about: 'Hey there!'
});

// Create a chat between two users
const chat = await Chat.create({
  participants: [userId1, userId2]
});

// Send a message
const message = await Message.create({
  chatId: chat._id,
  sender: userId1,
  receiver: userId2,
  type: 'text',
  content: 'Hi bro 👋'
});

// Mark message as delivered
await message.markAsDelivered();

// Mark message as read
await message.markAsRead();

// Create a session
const session = await Session.create({
  userId: newUser._id,
  token: 'jwt_token_here',
  expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
});
```

## Environment Variables

Create a `.env` file:

```env
MONGODB_URI=mongodb://localhost:27017/connetu
# or for MongoDB Atlas
# MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/connetu
```

## Indexes

All models have optimized indexes for:
- Fast user lookups by phone
- Efficient chat queries by participants
- Quick message retrieval by chatId
- Token-based session lookup

## Next Steps

1. Set up Express routes for CRUD operations
2. Implement Socket.io for real-time messaging
3. Add authentication middleware
4. Create API endpoints for messages, chats, and users
5. Implement file upload for profile pictures and media messages
