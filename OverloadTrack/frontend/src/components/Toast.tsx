import React from 'react';
import { Icon } from './Icons';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'info';
  text: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

const TOAST_ICONS = { success: 'checkCircle', error: 'alert', info: 'info' } as const;

export const ToastContainer: React.FC<ToastProps> = ({ toasts, onDismiss }) => {
  if (toasts.length === 0) return null;

  return (
    <div className="toast-container" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast-item toast-${toast.type}`}
          onClick={() => onDismiss(toast.id)}
        >
          <Icon name={TOAST_ICONS[toast.type]} size={20} />
          <span>{toast.text}</span>
        </div>
      ))}
    </div>
  );
};
