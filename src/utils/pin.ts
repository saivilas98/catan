// Player PINs are a local privacy convenience for a shared-laptop game — not an
// authentication system. Deliberately UI-only: PINs never enter GameState, so the
// game engine stays free of any concept of "who is allowed to look at what."

const PIN_PATTERN = /^\d{2}$/;

export function isValidPin(pin: string): boolean {
  return PIN_PATTERN.test(pin);
}

export interface PinValidationResult {
  valid: boolean;
  /** One message per player index that has a problem, empty string if none. */
  fieldErrors: string[];
}

/** Every PIN must be exactly two digits, and no two active players may share one. */
export function validatePlayerPins(pins: string[]): PinValidationResult {
  const fieldErrors: string[] = pins.map((pin) => (isValidPin(pin) ? '' : 'Enter a 2-digit PIN'));

  const seen = new Map<string, number>();
  pins.forEach((pin, index) => {
    if (!isValidPin(pin)) return;
    const firstIndex = seen.get(pin);
    if (firstIndex !== undefined) {
      fieldErrors[index] = 'PIN already used by another player';
      fieldErrors[firstIndex] = 'PIN already used by another player';
    } else {
      seen.set(pin, index);
    }
  });

  return { valid: fieldErrors.every((e) => e === ''), fieldErrors };
}
