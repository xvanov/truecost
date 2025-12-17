import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';

/**
 * UserMenu - Displays user avatar/initial pill.
 * Can be expanded later for dropdown actions if needed.
 */
export function UserMenu() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const initial = user.name?.charAt(0).toUpperCase() || 'U';

  const handleAccount = () => {
    setOpen(false);
    navigate('/account');
  };

  const handleContractorSettings = () => {
    setOpen(false);
    navigate('/contractor-settings');
  };

  const handleLogout = async () => {
    setOpen(false);
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div ref={menuRef} className="relative flex items-center">
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center space-x-2 rounded-full px-3 py-2 hover:bg-truecost-glass-bg/80 transition-colors"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-truecost-cyan to-truecost-teal flex items-center justify-center">
          <span className="font-heading font-bold text-truecost-bg-primary text-sm">
            {initial}
          </span>
        </div>
        <span className="hidden sm:block font-body text-body-meta text-truecost-text-secondary">
          {user.name}
        </span>
        <svg
          className={`w-4 h-4 text-truecost-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 top-[110%] z-50 min-w-[180px] rounded-glass shadow-xl border border-truecost-glass-border bg-truecost-bg-primary/95 backdrop-blur-md p-2 space-y-1">
          <button
            onClick={handleAccount}
            className="w-full text-left px-3 py-2 rounded-md font-body text-body-meta text-truecost-text-secondary hover:bg-truecost-glass-bg/80"
          >
            Account
          </button>
          <button
            onClick={handleContractorSettings}
            className="w-full text-left px-3 py-2 rounded-md font-body text-body-meta text-truecost-text-secondary hover:bg-truecost-glass-bg/80"
          >
            Contractor Settings
          </button>
          <div className="border-t border-truecost-glass-border my-1" />
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-md font-body text-body-meta text-truecost-danger hover:bg-truecost-danger/10"
          >
            Logout
          </button>
        </div>
      )}
    </div>
  );
}

