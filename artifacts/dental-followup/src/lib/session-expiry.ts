const SESSION_ENDED_KEY = "ghars:session-ended";
const listeners = new Set<() => void>();

let authenticated = false;
let expired = false;
let generation = 0;

export function subscribeToSessionExpiry(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function isSessionExpired() {
  return expired;
}

export function hasAuthenticatedSession() {
  return authenticated;
}

export function currentSessionGeneration() {
  return generation;
}

export function advanceSessionGeneration() {
  generation += 1;
}

export function markSessionAuthenticated() {
  if (!expired) authenticated = true;
}

export function resetSessionExpiry() {
  advanceSessionGeneration();
  expired = false;
  authenticated = false;
  listeners.forEach((listener) => listener());
}

export function broadcastSessionEnded() {
  advanceSessionGeneration();
  authenticated = false;
  try {
    localStorage.setItem(SESSION_ENDED_KEY, String(Date.now()));
  } catch {
    // Other tabs will still discover an invalid session on their next check.
  }
}

export function notifySessionExpired(broadcast = true) {
  if (!authenticated || expired) return;
  advanceSessionGeneration();
  expired = true;
  authenticated = false;
  listeners.forEach((listener) => listener());
  if (broadcast) broadcastSessionEnded();
}

export function isSessionEndedStorageEvent(event: StorageEvent) {
  return event.key === SESSION_ENDED_KEY && event.newValue !== null;
}