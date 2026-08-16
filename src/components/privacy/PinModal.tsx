import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

interface PinModalProps {
  playerName: string;
  error: string | null;
  onSubmit: (pin: string) => void;
  onCancel: () => void;
}

/**
 * Prompts for a 2-digit PIN as two single-digit boxes — a combination lock, not a
 * login form. Typing the second digit submits automatically. The comparison
 * itself happens in the parent — this component never sees the correct PIN, only
 * whether the last attempt was wrong.
 */
export function PinModal({ playerName, error, onSubmit, onCancel }: PinModalProps) {
  const [digits, setDigits] = useState<[string, string]>(['', '']);
  const [shake, setShake] = useState(false);
  const inputs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];

  // A fresh wrong-PIN error clears the boxes and shakes them for another attempt.
  useEffect(() => {
    if (!error) return;
    setDigits(['', '']);
    setShake(true);
    inputs[0].current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  const submitIfComplete = (next: [string, string]) => {
    if (next[0] && next[1]) onSubmit(next[0] + next[1]);
  };

  const handleDigit = (index: 0 | 1, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next: [string, string] = [...digits];
    next[index] = digit;
    setDigits(next);
    if (digit && index === 0) inputs[1].current?.focus();
    if (digit && index === 1) submitIfComplete(next);
  };

  const handleKeyDown = (index: 0 | 1, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index === 1) inputs[0].current?.focus();
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="pin-modal" onClick={(e) => e.stopPropagation()}>
        <div className="pin-modal__hand" aria-hidden="true">
          <span className="pin-modal__card-back" />
          <span className="pin-modal__card-back" />
          <span className="pin-modal__card-back" />
        </div>
        <h2 className="pin-modal__title">Private Hand</h2>
        <p className="pin-modal__body">{playerName}, enter your PIN to look at your cards.</p>

        <div className={`pin-modal__boxes${shake ? ' pin-modal__boxes--shake' : ''}`}>
          {([0, 1] as const).map((i) => (
            <input
              key={i}
              ref={inputs[i]}
              type="password"
              inputMode="numeric"
              autoComplete="off"
              autoFocus={i === 0}
              className="pin-modal__digit"
              value={digits[i]}
              maxLength={1}
              onChange={(e) => handleDigit(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onAnimationEnd={() => setShake(false)}
            />
          ))}
        </div>

        {error && <p className="pin-modal__error">{error}</p>}

        <div className="choice-modal__actions">
          <button type="button" className="btn btn--ghost" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!digits[0] || !digits[1]}
            onClick={() => submitIfComplete(digits)}
          >
            Reveal Cards
          </button>
        </div>
      </div>
    </div>
  );
}
