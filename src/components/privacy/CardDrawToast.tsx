/**
 * A brief, identity-free acknowledgement after buying a development card. The face
 * is never shown here — only "View My Cards" with a PIN reveals what it actually is.
 */
export function CardDrawToast() {
  return (
    <div className="card-draw-toast" role="status" aria-live="polite">
      <span className="card-draw-toast__card" aria-hidden="true">
        🂠
      </span>
      Card drawn — check it privately under Development
    </div>
  );
}
