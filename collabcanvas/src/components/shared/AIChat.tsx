/**
 * Shared AI Chat Component with View Context Tracking
 * Wraps FloatingChatPanel and adds view context awareness for use across all views
 */

import React from 'react';
import { FloatingChatPanel } from '../estimate/FloatingChatPanel';

interface AIChatProps {
  isVisible: boolean;
  onClose: () => void;
}

/**
 * Context-aware AI Chat component that tracks current view
 * Can be used in Scope, Time, Space, and Money views
 */
export const AIChat: React.FC<AIChatProps> = ({ isVisible, onClose }) => {
  // ChatPanel already handles view context tracking internally
  // via useLocation hook, so we just wrap it
  return <FloatingChatPanel isVisible={isVisible} onClose={onClose} />;
};
