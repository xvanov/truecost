import { useEffect, useMemo, useState } from 'react';
import {
  signInWithPopup,
  signInWithCredential,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  signInAnonymously,
  type User as FirebaseUser,
} from 'firebase/auth';
import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { auth } from '../services/firebase';
import type { User } from '../types';
import { getHarnessUser, isHarnessEnabled, registerHarnessApi } from '../utils/harness';

/**
 * Hook for managing Firebase authentication state
 * Provides Google Sign-In functionality and user data persistence
 */
export function useAuth() {
  const harnessUser = useMemo(() => getHarnessUser(), []);
  const harnessMode = isHarnessEnabled() && Boolean(harnessUser);
  const [user, setUser] = useState<User | null>(harnessUser ?? null);
  const [loading, setLoading] = useState(!harnessMode);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (harnessMode) {
      setLoading(true);
      registerHarnessApi('auth', {
        setUser,
      });

      if (!auth.currentUser) {
        signInAnonymously(auth)
          .then((result) => {
            const anon = result.user;
            const userData: User = {
              uid: anon.uid,
              name: harnessUser?.name ?? 'Harness User',
              email: harnessUser?.email ?? null,
              photoURL: harnessUser?.photoURL ?? null,
            };
            setUser(userData);
            if (typeof window !== 'undefined' && window.__perfHarness) {
              window.__perfHarness.user = userData;
            }
          })
          .catch((error) => {
            console.error('Harness anonymous sign-in failed:', error);
            setError(error.message ?? 'Failed to sign in');
          })
          .finally(() => {
            setLoading(false);
          });
      } else {
        const anon = auth.currentUser;
        const userData: User = {
          uid: anon.uid,
          name: harnessUser?.name ?? 'Harness User',
          email: harnessUser?.email ?? null,
          photoURL: harnessUser?.photoURL ?? null,
        };
        setUser(userData);
        if (typeof window !== 'undefined' && window.__perfHarness) {
          window.__perfHarness.user = userData;
        }
        setLoading(false);
      }

      return () => {
        // keep anonymous session; no cleanup required for harness mode
      };
    }

    // Listen for authentication state changes
    const unsubscribe = onAuthStateChanged(
      auth,
      (firebaseUser: FirebaseUser | null) => {
        if (firebaseUser) {
          // User is signed in
          const userData: User = {
            uid: firebaseUser.uid,
            name: firebaseUser.displayName || 'Anonymous',
            email: firebaseUser.email,
            photoURL: firebaseUser.photoURL,
          };
          setUser(userData);
        } else {
          // User is signed out
          setUser(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error('Auth state change error:', error);
        setError(error.message);
        setLoading(false);
      }
    );

    // Cleanup subscription on unmount
    return () => unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [harnessMode]);

  /**
   * Sign in with Google
   * Uses Capacitor Firebase Authentication plugin on native, popup on web
   */
  const signInWithGoogle = async () => {
    if (harnessMode && harnessUser) {
      setError(null);
      setUser(harnessUser);
      return harnessUser;
    }
    setError(null);
    setLoading(true);

    const isNative = Capacitor.isNativePlatform();

    try {
      if (isNative) {
        // On native platforms, use Capacitor Firebase Authentication plugin
        // This uses native Google Sign-In which handles everything properly
        const result = await FirebaseAuthentication.signInWithGoogle();

        if (result.user) {
          // Get the ID token to sign in with Firebase Auth
          const credential = GoogleAuthProvider.credential(result.credential?.idToken);
          const firebaseResult = await signInWithCredential(auth, credential);

          const userData: User = {
            uid: firebaseResult.user.uid,
            name: firebaseResult.user.displayName || 'Anonymous',
            email: firebaseResult.user.email,
            photoURL: firebaseResult.user.photoURL,
          };

          setUser(userData);
          return userData;
        }
        return null;
      } else {
        // On web, use popup
        const provider = new GoogleAuthProvider();
        const result = await signInWithPopup(auth, provider);

        const userData: User = {
          uid: result.user.uid,
          name: result.user.displayName || 'Anonymous',
          email: result.user.email,
          photoURL: result.user.photoURL,
        };

        setUser(userData);
        return userData;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign in';
      setError(errorMessage);
      console.error('Sign in error:', err);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  /**
   * Sign out the current user
   */
  const signOut = async () => {
    if (harnessMode && harnessUser) {
      setError(null);
      setUser(harnessUser);
      return;
    }
    setError(null);
    try {
      await firebaseSignOut(auth);
      setUser(null);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign out';
      setError(errorMessage);
      console.error('Sign out error:', err);
      throw err;
    }
  };

  return {
    user,
    loading,
    error,
    signInWithGoogle,
    signOut,
  };
}
