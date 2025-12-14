/**
 * Presence Indicator Component
 * Displays users currently in each view/tab
 */

import { useMemo } from 'react';
import { usePresence } from '../../hooks/usePresence';
import type { Presence } from '../../types';

type ViewType = 'scope' | 'time' | 'space' | 'money';

interface PresenceIndicatorProps {
  view: ViewType;
  className?: string;
}

export function PresenceIndicator({ view, className = '' }: PresenceIndicatorProps) {
  const { users } = usePresence();
  
  // Filter users by currentView
  const usersInView = useMemo(() => {
    return users.filter((user: Presence) => user.currentView === view);
  }, [users, view]);
  
  if (usersInView.length === 0) {
    return null;
  }
  
  return (
    <div className={`ml-2 flex items-center gap-1 ${className}`}>
      <div className="flex -space-x-1">
        {usersInView.slice(0, 3).map((user: Presence, index: number) => (
          <div
            key={user.userId || `presence-${index}`}
            className="h-5 w-5 rounded-full border-2 border-white"
            style={{ backgroundColor: user.color }}
            title={user.name}
          />
        ))}
      </div>
      {usersInView.length > 3 && (
        <span className="ml-1 text-xs text-gray-500">+{usersInView.length - 3}</span>
      )}
    </div>
  );
}

