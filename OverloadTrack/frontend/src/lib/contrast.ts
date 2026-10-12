// High-contrast variant of the theme, for bright gyms and outdoor sessions. A device preference,
// applied before the first render; until the athlete picks, it follows the system setting.
const CONTRAST_KEY = 'overloady.contrast';

const systemWantsMore = () => {
  try {
    return window.matchMedia('(prefers-contrast: more)').matches;
  } catch {
    return false;
  }
};

/** The contrast in effect: the athlete's choice on this device, else the system's. */
export const readHighContrast = (): boolean => {
  try {
    const stored = localStorage.getItem(CONTRAST_KEY);
    if (stored === 'high' || stored === 'normal') return stored === 'high';
  } catch {
    // Storage unavailable: fall back to the system setting.
  }
  return systemWantsMore();
};

export const applyHighContrast = (high: boolean) => {
  if (high) document.documentElement.dataset.contrast = 'high';
  else delete document.documentElement.dataset.contrast;
};

export const setHighContrast = (high: boolean) => {
  applyHighContrast(high);
  try {
    localStorage.setItem(CONTRAST_KEY, high ? 'high' : 'normal');
  } catch {
    // Storage unavailable: the choice lasts until the app is closed.
  }
};
