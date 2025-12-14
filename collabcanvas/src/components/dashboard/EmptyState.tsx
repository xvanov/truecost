import { Link } from 'react-router-dom';

/**
 * EmptyState - Shown when user has no projects.
 */
export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      {/* Illustration */}
      <div className="mb-8 relative w-64 h-32">
        <svg
          viewBox="0 0 256 128"
          className="w-full h-full opacity-20"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        >
          <rect x="20" y="60" width="40" height="68" className="stroke-truecost-cyan" />
          <line x1="30" y1="60" x2="30" y2="128" className="stroke-truecost-cyan" />
          <line x1="50" y1="60" x2="50" y2="128" className="stroke-truecost-cyan" />
          <line x1="20" y1="80" x2="60" y2="80" className="stroke-truecost-cyan" />
          <line x1="20" y1="100" x2="60" y2="100" className="stroke-truecost-cyan" />

          <rect x="80" y="40" width="50" height="88" className="stroke-truecost-cyan" />
          <line x1="95" y1="40" x2="95" y2="128" className="stroke-truecost-cyan" />
          <line x1="115" y1="40" x2="115" y2="128" className="stroke-truecost-cyan" />
          <line x1="80" y1="70" x2="130" y2="70" className="stroke-truecost-cyan" />
          <line x1="80" y1="100" x2="130" y2="100" className="stroke-truecost-cyan" />

          <rect x="150" y="50" width="45" height="78" className="stroke-truecost-cyan" />
          <line x1="165" y1="50" x2="165" y2="128" className="stroke-truecost-cyan" />
          <line x1="180" y1="50" x2="180" y2="128" className="stroke-truecost-cyan" />
          <line x1="150" y1="80" x2="195" y2="80" className="stroke-truecost-cyan" />
          <line x1="150" y1="110" x2="195" y2="110" className="stroke-truecost-cyan" />

          <rect x="210" y="70" width="35" height="58" className="stroke-truecost-cyan" />
          <line x1="227" y1="70" x2="227" y2="128" className="stroke-truecost-cyan" />
          <line x1="210" y1="95" x2="245" y2="95" className="stroke-truecost-cyan" />
        </svg>
      </div>

      <h2 className="font-heading text-h3 text-truecost-text-primary mb-2">No projects yet</h2>
      <p className="font-body text-body text-truecost-text-secondary mb-8 text-center max-w-md">
        Create your first project to get started with TrueCost
      </p>

      <Link to="/project/new" className="btn-pill-primary">
        Create Your First Project
      </Link>
    </div>
  );
}

