/**
 * useApi Hook
 * Provides easy access to the API client in components
 */

import { useContext } from 'react';
import { ApiContext, ApiContextType } from '../context/ApiContext';

export const useApi = (): ApiContextType => {
  const context = useContext(ApiContext);

  if (!context) {
    throw new Error('useApi must be used within ApiProvider');
  }

  return context;
};

export default useApi;
