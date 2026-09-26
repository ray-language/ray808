/**
 * Development on a phone: when the app was launched with RAY808_DEV_URL but the page came
 * from the embedded build (the dev server did not answer in time — typically because iOS
 * was still asking for the local-network permission, which fails the first connections),
 * keep knocking on the dev server from here and move to it as soon as it answers.
 * Polling from the page blocks nothing: the raylang program keeps serving the bridge.
 */
const INTERVAL_MS = 1500;
const GIVE_UP_MS = 120_000;

export function followDevServer(devUrl: string, onWaiting: (msg: string) => void): () => void {
  if (!devUrl) return () => {};
  let target: URL;
  try {
    target = new URL(devUrl);
  } catch {
    return () => {};
  }
  if (location.origin === target.origin) return () => {}; // already on it

  let stopped = false;
  const started = Date.now();
  const knock = async () => {
    if (stopped) return;
    try {
      // An opaque no-cors response is enough: it only has to answer at all.
      await fetch(new URL('@vite/client', target), { mode: 'no-cors', cache: 'no-store' });
      location.replace(target.href);
      return;
    } catch {
      /* not reachable (yet) */
    }
    if (Date.now() - started > GIVE_UP_MS) {
      onWaiting('DEV SERVER UNREACHABLE');
      return;
    }
    onWaiting(`WAITING FOR ${target.host}…`);
    setTimeout(knock, INTERVAL_MS);
  };
  void knock();
  return () => {
    stopped = true;
  };
}
