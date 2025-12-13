/**
 * Chat Service - Firestore persistence for project chat messages
 * Messages are stored per project, per user for isolation
 */

import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  writeBatch,
  getDocs,
  type Unsubscribe,
} from 'firebase/firestore';
import { firestore } from './firebase';

/**
 * Chat message structure
 */
export interface ChatMessage {
  id: string;
  role: 'agent' | 'user';
  content: string;
  timestamp: Date;
  metadata?: {
    createdShapes?: number;
    modifiedShapes?: number;
    deletedShapes?: number;
    calculation?: {
      materials: Array<{ name: string; quantity: number; unit: string }>;
    };
  };
}

/**
 * Firestore message structure
 */
interface FirestoreChatMessage {
  id: string;
  role: 'agent' | 'user';
  content: string;
  timestamp: ReturnType<typeof serverTimestamp> | Date;
  metadata?: ChatMessage['metadata'];
  createdAt: ReturnType<typeof serverTimestamp>;
}

/**
 * Get the chat messages collection for a project and user
 */
function getChatCollection(projectId: string, userId: string) {
  return collection(firestore, 'projects', projectId, 'chats', userId, 'messages');
}

/**
 * Save a chat message to Firestore
 */
export async function saveChatMessage(
  projectId: string,
  userId: string,
  message: ChatMessage
): Promise<void> {
  const chatCollection = getChatCollection(projectId, userId);
  const messageDoc = doc(chatCollection, message.id);
  
  // Build the Firestore message, excluding undefined fields
  // Firestore doesn't accept undefined values
  const firestoreMessage: Record<string, unknown> = {
    id: message.id,
    role: message.role,
    content: message.content,
    timestamp: message.timestamp,
    createdAt: serverTimestamp(),
  };
  
  // Only include metadata if it exists
  if (message.metadata !== undefined) {
    firestoreMessage.metadata = message.metadata;
  }
  
  await setDoc(messageDoc, firestoreMessage);
}

/**
 * Load all chat messages for a project and user
 */
export async function loadChatMessages(
  projectId: string,
  userId: string
): Promise<ChatMessage[]> {
  const chatCollection = getChatCollection(projectId, userId);
  const q = query(chatCollection, orderBy('createdAt', 'asc'));
  
  const snapshot = await getDocs(q);
  
  return snapshot.docs.map((doc) => {
    const data = doc.data() as FirestoreChatMessage;
    return {
      id: data.id,
      role: data.role,
      content: data.content,
      timestamp: data.timestamp instanceof Date 
        ? data.timestamp 
        : (data.timestamp as { toDate?: () => Date })?.toDate?.() || new Date(),
      metadata: data.metadata,
    };
  });
}

/**
 * Subscribe to chat messages for real-time updates
 */
export function subscribeToChatMessages(
  projectId: string,
  userId: string,
  onMessages: (messages: ChatMessage[]) => void
): Unsubscribe {
  const chatCollection = getChatCollection(projectId, userId);
  const q = query(chatCollection, orderBy('createdAt', 'asc'));
  
  return onSnapshot(q, (snapshot) => {
    const messages = snapshot.docs.map((doc) => {
      const data = doc.data() as FirestoreChatMessage;
      return {
        id: data.id,
        role: data.role as 'agent' | 'user',
        content: data.content,
        timestamp: data.timestamp instanceof Date 
          ? data.timestamp 
          : (data.timestamp as { toDate?: () => Date })?.toDate?.() || new Date(),
        metadata: data.metadata,
      };
    });
    onMessages(messages);
  });
}

/**
 * Delete a specific chat message
 */
export async function deleteChatMessage(
  projectId: string,
  userId: string,
  messageId: string
): Promise<void> {
  const chatCollection = getChatCollection(projectId, userId);
  const messageDoc = doc(chatCollection, messageId);
  await deleteDoc(messageDoc);
}

/**
 * Clear all chat messages for a project and user
 */
export async function clearChatMessages(
  projectId: string,
  userId: string
): Promise<void> {
  const chatCollection = getChatCollection(projectId, userId);
  const snapshot = await getDocs(chatCollection);
  
  const batch = writeBatch(firestore);
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });
  
  await batch.commit();
}

