/**
 * Clarification Chat Component
 * Handles the clarification conversation with the AI agent
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../services/firebase';
import type { ClarificationMessage } from '../../types/estimation';

interface ClarificationChatProps {
  projectId: string;
  sessionId: string;
  scopeText: string;
  messages: ClarificationMessage[];
  onMessageAdd: (message: Omit<ClarificationMessage, 'id' | 'timestamp'>) => void;
  onComplete: (extractedData: Record<string, unknown>) => void;
  disabled?: boolean;
}

interface AgentResponse {
  success: boolean;
  message: string;
  questions: string[];
  extractedData: Record<string, unknown>;
  clarificationComplete: boolean;
  completionReason: string | null;
  error?: string;
}

export function ClarificationChat({
  projectId,
  sessionId,
  scopeText,
  messages,
  onMessageAdd,
  onComplete,
  disabled = false,
}: ClarificationChatProps) {
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allExtractedData, setAllExtractedData] = useState<Record<string, unknown>>({});
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-start conversation if no messages yet
  useEffect(() => {
    if (messages.length === 0 && !isProcessing && scopeText) {
      sendToAgent('');
    }
  }, [messages.length, scopeText]);

  const sendToAgent = useCallback(async (userMessage: string) => {
    if (isProcessing) return;
    
    setIsProcessing(true);
    setError(null);

    try {
      // If user sent a message, add it to the chat
      if (userMessage.trim()) {
        onMessageAdd({
          role: 'user',
          content: userMessage.trim(),
        });
      }

      // Call the clarification agent
      const clarificationAgent = httpsCallable<unknown, AgentResponse>(
        functions,
        'clarificationAgent'
      );

      const conversationHistory = messages.map((m) => ({
        role: m.role,
        content: m.content,
      }));

      // Add the current user message to history
      if (userMessage.trim()) {
        conversationHistory.push({
          role: 'user',
          content: userMessage.trim(),
        });
      }

      const result = await clarificationAgent({
        projectId,
        sessionId,
        scopeText,
        conversationHistory,
        userMessage: userMessage.trim(),
      });

      const response = result.data;

      if (!response.success && response.error) {
        throw new Error(response.error);
      }

      // Merge extracted data
      const newExtractedData = {
        ...allExtractedData,
        ...response.extractedData,
      };
      setAllExtractedData(newExtractedData);

      // Build assistant message
      let assistantContent = response.message;
      if (response.questions && response.questions.length > 0) {
        assistantContent += '\n\n' + response.questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
      }

      // Add assistant response
      onMessageAdd({
        role: 'assistant',
        content: assistantContent,
        extractedData: response.extractedData,
      });

      // Check if clarification is complete
      if (response.clarificationComplete) {
        onComplete(newExtractedData);
      }
    } catch (err) {
      console.error('Clarification agent error:', err);
      setError(err instanceof Error ? err.message : 'Failed to get response');
    } finally {
      setIsProcessing(false);
    }
  }, [projectId, sessionId, scopeText, messages, allExtractedData, onMessageAdd, onComplete, isProcessing]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || isProcessing || disabled) return;

    sendToAgent(inputValue);
    setInputValue('');
  }, [inputValue, isProcessing, disabled, sendToAgent]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  return (
    <div className="flex flex-col h-full bg-white rounded-lg border border-gray-200">
      {/* Chat Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50 rounded-t-lg">
        <h3 className="font-medium text-gray-900">Clarification Assistant</h3>
        <p className="text-xs text-gray-500">
          Answer questions to help us understand your project better
        </p>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-lg px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              <div className="whitespace-pre-wrap text-sm">{message.content}</div>
              <div
                className={`text-xs mt-1 ${
                  message.role === 'user' ? 'text-blue-200' : 'text-gray-400'
                }`}
              >
                {new Date(message.timestamp).toLocaleTimeString()}
              </div>
            </div>
          </div>
        ))}

        {isProcessing && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-lg px-4 py-3">
              <div className="flex items-center space-x-2">
                <div className="flex space-x-1">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                </div>
                <span className="text-sm text-gray-500">Thinking...</span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Error Display */}
      {error && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-200">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Input Area */}
      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-200">
        <div className="flex space-x-2">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type your answer..."
            disabled={isProcessing || disabled}
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
            rows={2}
          />
          <button
            type="submit"
            disabled={!inputValue.trim() || isProcessing || disabled}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              inputValue.trim() && !isProcessing && !disabled
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            {isProcessing ? (
              <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Press Enter to send, Shift+Enter for new line
        </p>
      </form>
    </div>
  );
}

