import admin from 'firebase-admin';
import dotenv from 'dotenv';

dotenv.config();

// Initialize Firebase Admin SDK
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      }),
      databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`,
    });
    console.log('✅ Firebase Admin SDK initialized');
  } catch (error) {
    console.error('❌ Firebase initialization error:', error);
    throw error;
  }
}

// Get Firestore instance
const db = admin.firestore();

// Firestore helper functions
export const firestoreHelpers = {
  // Get user document
  async getUserDoc(uid) {
    const userRef = db.collection('users').doc(uid);
    const userDoc = await userRef.get();
    return userDoc.exists ? { id: userDoc.id, ...userDoc.data() } : null;
  },

  // Create or update user document
  async setUserDoc(uid, data) {
    const userRef = db.collection('users').doc(uid);
    await userRef.set(data, { merge: true });
    return { id: uid, ...data };
  },

  // Get all messages for a user
  async getUserMessages(uid, limit = 100) {
    const messagesRef = db.collection('users').doc(uid).collection('messages');
    const snapshot = await messagesRef.orderBy('timestamp', 'desc').limit(limit).get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  // Get a single message
  async getMessage(uid, messageId) {
    const messageRef = db.collection('users').doc(uid).collection('messages').doc(messageId);
    const messageDoc = await messageRef.get();
    return messageDoc.exists ? { id: messageDoc.id, ...messageDoc.data() } : null;
  },

  // Create a message
  async createMessage(uid, messageData) {
    const messagesRef = db.collection('users').doc(uid).collection('messages');
    const docRef = await messagesRef.add(messageData);
    return { id: docRef.id, ...messageData };
  },

  // Update a message
  async updateMessage(uid, messageId, updates) {
    const messageRef = db.collection('users').doc(uid).collection('messages').doc(messageId);
    await messageRef.update(updates);
    return { id: messageId, ...updates };
  },

  // Delete a message
  async deleteMessage(uid, messageId) {
    const messageRef = db.collection('users').doc(uid).collection('messages').doc(messageId);
    await messageRef.delete();
    return { id: messageId };
  },

  // Get expired messages
  async getExpiredMessages() {
    const now = new Date().toISOString();
    const usersSnapshot = await db.collection('users').get();
    const expiredMessages = [];

    for (const userDoc of usersSnapshot.docs) {
      const messagesRef = userDoc.ref.collection('messages');
      const snapshot = await messagesRef
        .where('expiresAt', '<=', now)
        .where('starred', '==', false)
        .get();

      snapshot.docs.forEach((doc) => {
        expiredMessages.push({
          uid: userDoc.id,
          messageId: doc.id,
          ...doc.data(),
        });
      });
    }

    return expiredMessages;
  },

  // Search messages
  async searchMessages(uid, query) {
    const messagesRef = db.collection('users').doc(uid).collection('messages');
    const snapshot = await messagesRef.orderBy('timestamp', 'desc').get();

    // Client-side filtering (Firestore doesn't support full-text search natively)
    const results = snapshot.docs
      .map((doc) => ({ id: doc.id, ...doc.data() }))
      .filter((msg) => {
        if (msg.type === 'text' && msg.text) {
          return msg.text.toLowerCase().includes(query.toLowerCase());
        }
        if (msg.type === 'file' && msg.fileName) {
          return msg.fileName.toLowerCase().includes(query.toLowerCase());
        }
        return false;
      });

    return results;
  },

  // Get messages by file category
  async getMessagesByCategory(uid, category) {
    const messagesRef = db.collection('users').doc(uid).collection('messages');
    const snapshot = await messagesRef
      .where('type', '==', 'file')
      .where('fileCategory', '==', category)
      .orderBy('timestamp', 'desc')
      .get();

    return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
  },

  // Get starred messages
  async getStarredMessages(uid) {
    const messagesRef = db.collection('users').doc(uid).collection('messages');

    try {
      // Try to query with orderBy (requires composite index)
      const snapshot = await messagesRef
        .where('starred', '==', true)
        .orderBy('timestamp', 'desc')
        .get();

      return snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      // If composite index doesn't exist, fetch without orderBy and sort in memory
      console.log('Composite index not available, falling back to client-side sort');
      const snapshot = await messagesRef.where('starred', '==', true).get();

      const messages = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // Sort in memory
      return messages.sort((a, b) => {
        const dateA = new Date(a.timestamp);
        const dateB = new Date(b.timestamp);
        return dateB - dateA; // desc order
      });
    }
  },

  // Update user analytics
  async updateUserAnalytics(uid, updates) {
    const userRef = db.collection('users').doc(uid);
    await userRef.update({
      lastActive: new Date().toISOString(),
      ...updates,
    });
  },
};

export { db, admin };
export default db;
