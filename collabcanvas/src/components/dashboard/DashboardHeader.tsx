import { Link } from 'react-router-dom';
import { Button } from '../ui/Button';

interface DashboardHeaderProps {
  viewMode: 'cards' | 'list';
  onViewModeChange: (mode: 'cards' | 'list') => void;
}

/**
 * DashboardHeader - Title + view toggle + New Project button.
 */
export function DashboardHeader({ viewMode, onViewModeChange }: DashboardHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
      <h1 className="font-heading text-h2 text-truecost-text-primary">Your Projects</h1>

      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1 glass-panel p-1 rounded-pill">
          <button
            onClick={() => onViewModeChange('cards')}
            className={`
              px-4 py-2 rounded-pill font-body text-body-meta transition-all duration-120
              ${
                viewMode === 'cards'
                  ? 'bg-gradient-to-br from-truecost-cyan to-truecost-teal text-truecost-bg-primary font-semibold'
                  : 'text-truecost-text-secondary hover:text-truecost-text-primary'
              }
            `}
            aria-label="Card view"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"
              />
            </svg>
          </button>
          <button
            onClick={() => onViewModeChange('list')}
            className={`
              px-4 py-2 rounded-pill font-body text-body-meta transition-all duration-120
              ${
                viewMode === 'list'
                  ? 'bg-gradient-to-br from-truecost-cyan to-truecost-teal text-truecost-bg-primary font-semibold'
                  : 'text-truecost-text-secondary hover:text-truecost-text-primary'
              }
            `}
            aria-label="List view"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>

        <Link to="/project/new">
          <Button variant="primary">New Project</Button>
        </Link>
      </div>
    </div>
  );
}

