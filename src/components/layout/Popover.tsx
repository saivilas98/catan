import type { ReactNode } from 'react';

interface PopoverProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

/**
 * The one popup shape every dock/top-bar trigger opens into — a light card
 * centered over the board, reusing the app's existing modal-backdrop pattern.
 * Content is whatever used to live permanently in a sidebar; nothing here
 * changes what that content does, only that it now only exists on demand.
 */
export function Popover({ title, onClose, children }: PopoverProps) {
  return (
    <div className="modal-backdrop popover-backdrop" onClick={onClose}>
      <div className="popover" onClick={(e) => e.stopPropagation()}>
        <header className="popover__header">
          <h2>{title}</h2>
          <button type="button" className="popover__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>
        <div className="popover__body">{children}</div>
      </div>
    </div>
  );
}
