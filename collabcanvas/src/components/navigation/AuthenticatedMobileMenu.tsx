import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NavLink } from './NavLink';
import { useAuth } from '../../hooks/useAuth';

/**
 * AuthenticatedMobileMenu - Hamburger menu for authenticated navigation.
 * Includes logout functionality.
 */
export function AuthenticatedMobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const { signOut } = useAuth();
  const navigate = useNavigate();

  const toggleMenu = () => setIsOpen(!isOpen);
  const closeMenu = () => setIsOpen(false);

  const handleLogout = async () => {
    closeMenu();
    try {
      await signOut();
      navigate('/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  };

  return (
    <div className="md:hidden">
      <button
        onClick={toggleMenu}
        className="btn-utility p-2"
        aria-label="Toggle menu"
        aria-expanded={isOpen}
      >
        {isOpen ? (
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        ) : (
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 top-14 bg-black/50 z-40"
            onClick={closeMenu}
            aria-hidden="true"
          />

          {/* Menu Panel */}
          <div className="fixed top-14 left-0 right-0 z-50 glass-panel mx-4 mt-2 rounded-glass">
            <nav className="flex flex-col p-4 space-y-4">
              <NavLink to="/dashboard" onClick={closeMenu}>
                Dashboard
              </NavLink>
              <NavLink to="/project/new" onClick={closeMenu}>
                New Project
              </NavLink>
              <NavLink to="/account" onClick={closeMenu}>
                Account
              </NavLink>
              <button
                onClick={handleLogout}
                className="text-left font-body text-body-meta text-truecost-text-secondary hover:text-truecost-danger transition-colors duration-120"
              >
                Logout
              </button>
            </nav>
          </div>
        </>
      )}
    </div>
  );
}

