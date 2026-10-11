import React, { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from './Icons';

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  /** Danger: the action destroys something, the confirm button turns red. */
  tone?: 'danger' | 'default';
  icon?: IconName;
  /** Extra content between the message and the actions (e.g. what will be lost). */
  children?: React.ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

/** In-app replacement for window.confirm, styled like the other modals. */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel = 'Annuler',
  tone = 'default',
  icon = 'alert',
  children,
  onConfirm,
  onCancel,
}) => {
  const [busy, setBusy] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  // Latest handler, so the key listener survives the parent re-rendering (e.g. every second of a timer)
  const cancelHandler = useRef(onCancel);
  useEffect(() => {
    cancelHandler.current = busy ? () => undefined : onCancel;
  });

  useEffect(() => {
    if (!isOpen) return;
    // The safe choice gets the focus: Enter never destroys anything by accident
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && cancelHandler.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen]);

  if (!isOpen) return null;

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={() => !busy && onCancel()}>
      <div
        className={`modal-card confirm-dialog is-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-message"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="confirm-dialog-icon" aria-hidden="true">
          <Icon name={icon} size={22} />
        </span>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-message" className="confirm-dialog-message">
          {message}
        </p>

        {children}

        <div className="confirm-dialog-actions">
          <button ref={cancelRef} type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'btn-primary btn-danger' : 'btn-primary'}
            onClick={confirm}
            disabled={busy}
          >
            {busy ? 'Un instant…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
