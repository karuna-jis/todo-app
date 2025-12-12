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
  
  console.log(`[Badge] 🔧 Setting badge to ${count}...`);
  console.log(`[Badge] Badge API supported: ${isBadgeSupported()}`);
  console.log(`[Badge] Current localStorage count: ${getBadgeCount()}`);
  
  if (isBadgeSupported()) {
    try {
      if (count > 0) {
        await navigator.setAppBadge(count);
        console.log(`[Badge] ✅ Badge set to ${count} (Badge API)`);
        console.log(`[Badge] Check app icon - badge should show ${count}`);
      } else {
        await navigator.clearAppBadge();
        console.log('[Badge] ✅ Badge cleared (Badge API)');
      }
      // Also store in localStorage for consistency
      setBadgeCountStorage(count);
    } catch (error) {
      console.error('[Badge] ❌ Error setting badge via Badge API:', error);
      console.error('[Badge] Error details:', error.message);
      // Fallback to localStorage
      setBadgeCountStorage(count);
    }
  } else {
    // Fallback: store in localStorage
    console.log(`[Badge] ⚠️ Badge API not supported in this browser`);
    console.log(`[Badge] Storing count ${count} in localStorage (will show when Badge API is supported)`);
    setBadgeCountStorage(count);
  }
};

/**
 * Increment badge count by 1
 */
export const incrementBadge = async () => {
  const currentCount = getBadgeCount();
  const newCount = currentCount + 1;
  console.log(`[Badge] 📈 Incrementing badge: ${currentCount} → ${newCount}`);
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
 * - Clears badge if app is focused/visible AND count is 0
 * - Restores badge count if app was in background
 */
export const initializeBadge = async () => {
  const count = getBadgeCount();
  console.log('[Badge] 🔄 Initializing badge, current count:', count);
  
  // Check if app is visible/focused
  if (document.visibilityState === 'visible' || document.hasFocus()) {
    // Only clear if count is 0 (fresh start)
    // Don't clear if badge was set while app was in background
    if (count === 0) {
      await clearAppBadge();
      console.log('[Badge] ✅ App launched - badge cleared (count was 0)');
    } else {
      // Restore badge count
      await setAppBadge(count);
      console.log(`[Badge] ✅ App launched - badge restored to ${count}`);
    }
  } else {
    // App might be in background, restore badge count
    if (count > 0) {
      await setAppBadge(count);
      console.log(`[Badge] ✅ App in background - badge restored to ${count}`);
    }
  }
};

/**
 * Test badge functionality (for debugging)
 * Expose to window for console testing
 */
export const testBadge = async () => {
  console.log('🧪 Testing Badge API...');
  console.log('Badge API supported:', isBadgeSupported());
  console.log('Current count:', getBadgeCount());
  
  if (isBadgeSupported()) {
    try {
      await navigator.setAppBadge(99);
      console.log('✅ Test: Badge set to 99 - check app icon!');
      
      setTimeout(async () => {
        await navigator.clearAppBadge();
        console.log('✅ Test: Badge cleared');
      }, 3000);
    } catch (error) {
      console.error('❌ Test failed:', error);
    }
  } else {
    console.log('⚠️ Badge API not supported - cannot test');
  }
};

// Expose test function to window for console access
if (typeof window !== 'undefined') {
  window.testBadge = testBadge;
  console.log('[Badge] 💡 Run testBadge() in console to test badge functionality');
}

