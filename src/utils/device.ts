// Detects touch-primary devices (no hovering mouse / fine pointer) so we can
// avoid desktop-only interaction patterns like Enter-to-send or autoFocus
// stealing the on-screen keyboard.
export const isTouchPrimaryDevice = (): boolean => {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
};
