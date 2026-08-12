import { useEffect, useState } from 'react';

/**
 * Live connectivity.
 *
 * The app works entirely offline — rules data is bundled and every write goes to IndexedDB — so
 * this is not a failure state, and the banner it drives says so. It exists because a player whose
 * phone has dropped signal at a table needs to know their sheet is still theirs, and because a
 * silent offline state would otherwise be indistinguishable from a broken app.
 *
 * `navigator.onLine` only reports whether a network interface exists, not whether anything is
 * reachable; that is exactly the right resolution here, since nothing is fetched at runtime.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    // The events can fire between first render and this effect, so re-read on mount.
    setOnline(navigator.onLine);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  return online;
}
