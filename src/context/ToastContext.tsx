import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { View } from 'react-native';
import { Toast, ToastType } from '../components/molecules/Toast';

export interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  showSuccess: (message: string, duration?: number) => void;
  showError: (message: string, duration?: number) => void;
  showWarning: (message: string, duration?: number) => void;
  showInfo: (message: string, duration?: number) => void;
  dismissToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export interface ToastProviderProps {
  children: React.ReactNode;
}

/**
 * Toast Provider Component
 * Wrap your app with this to enable toast notifications
 *
 * @example
 * <ToastProvider>
 *   <App />
 * </ToastProvider>
 */
export const ToastProvider = ({ children }: ToastProviderProps) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const generateId = () => `toast-${Date.now()}-${Math.random()}`;

  const dismissToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = 'info', duration?: number) => {
      const id = generateId();
      const toast: ToastMessage = { id, message, type, duration };

      setToasts(prev => [...prev, toast]);

      // Auto-remove based on duration
      const autoRemoveTime = duration ?? (type === 'error' ? 5000 : 3000);
      setTimeout(() => {
        dismissToast(id);
      }, autoRemoveTime);
    },
    [dismissToast],
  );

  const showSuccess = useCallback(
    (message: string, duration?: number) => {
      showToast(message, 'success', duration);
    },
    [showToast],
  );

  const showError = useCallback(
    (message: string, duration?: number) => {
      showToast(message, 'error', duration);
    },
    [showToast],
  );

  const showWarning = useCallback(
    (message: string, duration?: number) => {
      showToast(message, 'warning', duration);
    },
    [showToast],
  );

  const showInfo = useCallback(
    (message: string, duration?: number) => {
      showToast(message, 'info', duration);
    },
    [showToast],
  );

  const value = useMemo(
    () => ({
      showToast,
      showSuccess,
      showError,
      showWarning,
      showInfo,
      dismissToast,
    }),
    [showToast, showSuccess, showError, showWarning, showInfo, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          pointerEvents: 'none',
        }}
      >
        {toasts.map(toast => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.duration}
            onDismiss={() => dismissToast(toast.id)}
          />
        ))}
      </View>
    </ToastContext.Provider>
  );
};

/**
 * useToast Hook
 * Use this hook to show toast notifications from any component
 *
 * @example
 * const { showSuccess, showError } = useToast();
 *
 * const handleClick = async () => {
 *   try {
 *     await doSomething();
 *     showSuccess('Success!');
 *   } catch (error) {
 *     showError('Failed!');
 *   }
 * };
 */
export const useToast = (): ToastContextType => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
