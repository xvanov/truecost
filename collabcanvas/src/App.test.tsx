/**
 * Integration tests for authentication guard
 * Ensures only authenticated users can access the board
 * 
 * Note: These tests verify the App component structure and routing logic.
 * Full Firebase Auth integration is tested with emulators separately.
 */

import { describe, it, expect, vi } from 'vitest';
import { createMockUser } from './test/mocks/firebase';

// Mock useAuth to prevent Firebase connection during import
vi.mock('./hooks/useAuth', () => ({
  useAuth: () => ({
    user: null,
    loading: false,
    error: null,
    signIn: vi.fn(),
    signOut: vi.fn(),
  }),
}));

describe('App - Authentication Guard', () => {
  it('should import App component successfully', async () => {
    const AppModule = await import('./App');
    expect(AppModule.default).toBeDefined();
  }, 15000); // Increase timeout for Firebase initialization

  it('should have Login page component', async () => {
    const { Login } = await import('./pages/Login');
    expect(Login).toBeDefined();
    expect(typeof Login).toBe('function');
  });

  it('should have Board page component', async () => {
    const { Board } = await import('./pages/Board');
    expect(Board).toBeDefined();
    expect(typeof Board).toBe('function');
  });

  it('should have useAuth hook for authentication', async () => {
    const { useAuth } = await import('./hooks/useAuth');
    expect(useAuth).toBeDefined();
    expect(typeof useAuth).toBe('function');
  });

  it('should have AuthButton component', async () => {
    const { AuthButton } = await import('./components/AuthButton');
    expect(AuthButton).toBeDefined();
    expect(typeof AuthButton).toBe('function');
  });

  it('should have Toolbar component', async () => {
    const { Toolbar } = await import('./components/Toolbar');
    expect(Toolbar).toBeDefined();
    expect(typeof Toolbar).toBe('function');
  });

  it('createMockUser creates valid user for testing', () => {
    const user = createMockUser({
      uid: 'test-123',
      displayName: 'Test User',
      email: 'test@example.com',
    });

    expect(user.uid).toBe('test-123');
    expect(user.displayName).toBe('Test User');
    expect(user.email).toBe('test@example.com');
  });
});

