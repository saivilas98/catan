import { useEffect, useState } from 'react';

/**
 * Toggles the whole page in/out of the browser's Fullscreen API. Tracks the
 * actual document state (not just its own click) so it still shows the right
 * icon if the user exits fullscreen via Esc or the browser's own chrome.
 */
export function FullscreenButton({ className }: { className: string }) {
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  if (!document.fullscreenEnabled) return null;

  const toggle = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen().catch(() => {});
    }
  };

  return (
    <button
      type="button"
      className={className}
      onClick={toggle}
      aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
      title={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
    >
      {isFullscreen ? '⤡' : '⤢'}
    </button>
  );
}
