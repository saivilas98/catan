interface ConfirmNewGameModalProps {
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmNewGameModal({ onConfirm, onCancel }: ConfirmNewGameModalProps) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="choice-modal" onClick={(e) => e.stopPropagation()}>
        <h2 className="choice-modal__title">Start a New Game?</h2>
        <p className="choice-modal__body">
          This will reset the board, players, resources and scores. The current game
          cannot be resumed.
        </p>
        <div className="choice-modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="btn btn--primary" onClick={onConfirm}>
            New Game
          </button>
        </div>
      </div>
    </div>
  );
}
