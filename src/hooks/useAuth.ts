/**
 * useAuth Hook
 * Custom hook to access authentication context
 */

import { useContext } from 'react';
import AuthContext, { AuthContextType } from '../context/AuthContext';

/**
 * Hook to use authentication context
 * @throws Error if used outside AuthProvider
 */
export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }

  return context;
}

export default useAuth;
