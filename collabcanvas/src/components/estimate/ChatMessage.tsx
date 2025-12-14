interface ChatMessageProps {
  role: 'agent' | 'user';
  content: string;
  timestamp?: Date;
}

/**
 * ChatMessage - Single message bubble with agent/user styles.
 */
export function ChatMessage({ role, content, timestamp }: ChatMessageProps) {
  return (
    <div className={`flex ${role === 'user' ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className="max-w-[80%]">
        <p className="font-body text-body-meta text-truecost-text-muted mb-1 px-2">
          {role === 'agent' ? 'Project Assistant' : 'You'}
        </p>
        <div
          className={`
            glass-panel p-4 rounded-2xl
            ${
              role === 'agent'
                ? 'bg-truecost-cyan/10 border-truecost-cyan/30'
                : 'bg-truecost-glass-bg border-truecost-glass-border'
            }
          `}
        >
          <p className="font-body text-body text-truecost-text-primary whitespace-pre-wrap">{content}</p>
          {timestamp && (
            <p className="font-body text-body-meta text-truecost-text-muted mt-2">
              {timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

