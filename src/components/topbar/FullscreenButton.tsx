import { useEffect, useState } from 'react';

/**
 * Toggles the whole page in and out of the browser's native fullscreen mode —
 * on a shared laptop or tablet passed around a table, every extra pixel spent
 * on browser chrome is a pixel not spent on the board. Hidden entirely where
 * the Fullscreen API isn't available (iOS/iPadOS Safari for regular elements,
 * notably) rather than showing a button that would silently do nothing.
 */
export function FullscreenButton() {
  const [supported] = useState(() => typeof document !== 'undefined' && document.fullscreenEnabled);
  const [isFullscreen, setIsFullscreen] = useState(() => Boolean(document.fullscreenElement));

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  if (!supported) return null;

  const toggle = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen().catch(() => {
        // Some browsers reject outside a direct user gesture or when already
        // mid-transition; nothing useful to do beyond leaving state as-is.
      });
    }
  };

  return (
    <button
      type="button"
      className="btn btn--quiet top-bar__fullscreen"
      onClick={toggle}
      aria-label={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
      title={isFullscreen ? 'Exit full screen' : 'Enter full screen'}
    >
      {isFullscreen ? '⛝' : '⛶'}
    </button>
  );
}
