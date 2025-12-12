// Badge API utility with localStorage fallback
// Supports navigator.setAppBadge() and navigator.clearAppBadge()

const BADGE_STORAGE_KEY = 'pwa_badge_count';

/**
 * Check if Badge API is supported
 */
export const isBadgeSupported = () => {
  return 'setAppBadge' in navigator && 'clearAppBadge' in navigator;
};

/**
 * Get current badge count from localStorage
 */
export const getBadgeCount = () => {
  try {
    const count = localStorage.getItem(BADGE_STORAGE_KEY);
    return count ? parseInt(count, 10) : 0;
  } catch (error) {
    console.error('[Badge] Error reading badge count from localStorage:', error);
    return 0;
  }
};

/**
 * Set badge count in localStorage
 */
const setBadgeCountStorage = (count) => {
  try {
    if (count > 0) {
      localStorage.setItem(BADGE_STORAGE_KEY, count.toString());
    } else {
      localStorage.removeItem(BADGE_STORAGE_KEY);
    }
  } catch (error) {
    console.error('[Badge] Error writing badge count to localStorage:', error);
  }
};

/**
 * Set app badge count
 * @param {number} count - Badge count to set
 */
export const setAppBadge = async (count) => {
  if (count < 0) count = 0;
  
  if (isBadgeSupported()) {
    try {
      if (count > 0) {
        await navigator.setAppBadge(count);
        console.log(`[Badge] ✅ Badge set to ${count} (Badge API)`);
      } else {
        await navigator.clearAppBadge();
        console.log('[Badge] ✅ Badge cleared (Badge API)');
      }
      // Also store in localStorage for consistency
      setBadgeCountStorage(count);
    } catch (error) {
      console.error('[Badge] ❌ Error setting badge via Badge API:', error);
      // Fallback to localStorage
      setBadgeCountStorage(count);
    }
  } else {
    // Fallback: store in localStorage
    console.log(`[Badge] ⚠️ Badge API not supported, using localStorage (count: ${count})`);
    setBadgeCountStorage(count);
  }
};

/**
 * Increment badge count by 1
 */
export const incrementBadge = async () => {
  const currentCount = getBadgeCount();
  const newCount = currentCount + 1;
  await setAppBadge(newCount);
  return newCount;
};

/**
 * Clear app badge (set to 0)
 */
export const clearAppBadge = async () => {
  await setAppBadge(0);
};

/**
 * Initialize badge on app launch
 * - Clears badge if app is focused/visible
 * - Restores badge count if app was in background
 */
export const initializeBadge = async () => {
  // Check if app is visible/focused
  if (document.visibilityState === 'visible' || document.hasFocus()) {
    // App is active, clear badge
    await clearAppBadge();
    console.log('[Badge] ✅ App launched/focused - badge cleared');
  } else {
    // App might be in background, restore badge count
    const count = getBadgeCount();
    if (count > 0) {
      await setAppBadge(count);
      console.log(`[Badge] ✅ App in background - badge restored to ${count}`);
    }
  }
};

