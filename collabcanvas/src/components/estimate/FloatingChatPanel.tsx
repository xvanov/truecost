/**
 * FloatingChatPanel - Floating/modal wrapper for ChatPanel
 * Used in CanvasNavbar, Toolbar, and other places where a floating chat is needed.
 */

import React from 'react';
import { ChatPanel } from './ChatPanel';

interface FloatingChatPanelProps {
  isVisible: boolean;
  onClose: () => void;
}

export const FloatingChatPanel: React.FC<FloatingChatPanelProps> = ({
  isVisible,
  onClose,
}) => {
  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 w-96 h-[600px] bg-truecost-bg-primary rounded-lg shadow-2xl border border-truecost-glass-border z-50 flex flex-col overflow-hidden">
      {/* Close button header */}
      <div className="flex items-center justify-between p-4 border-b border-truecost-glass-border bg-gradient-to-r from-truecost-cyan/20 to-truecost-teal/20">
        <div>
          <h2 className="text-lg font-semibold text-truecost-text-primary">AI Assistant</h2>
          <p className="text-xs text-truecost-text-secondary">Shapes, materials, and more</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-truecost-text-secondary hover:text-truecost-text-primary rounded transition-colors"
          title="Close"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* ChatPanel fills the rest */}
      <div className="flex-1 overflow-hidden">
        <ChatPanel />
      </div>
    </div>
  );
};

