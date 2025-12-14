/**
 * Floating AI Chat Button Component
 * Provides a floating button that opens/closes the AI chat panel
 * Available on all views: Scope, Time, Space, Money
 */

import { useState } from 'react';
import { FloatingChatPanel } from '../estimate/FloatingChatPanel';

export const FloatingAIChat: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-6 left-6 w-14 h-14 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-full shadow-lg hover:shadow-xl transition-all duration-200 flex items-center justify-center z-50 hover:scale-110"
          title="Open AI Assistant"
          aria-label="Open AI Assistant"
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
          </svg>
        </button>
      )}

      {/* AI Chat Panel */}
      <FloatingChatPanel 
        isVisible={isOpen} 
        onClose={() => setIsOpen(false)} 
      />
    </>
  );
};

