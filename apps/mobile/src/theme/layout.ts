import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Chrome the whole app has to measure against.
 *
 * The web keeps `--mobile-nav-height` in tokens.css for the same reason: more
 * than one thing needs the number — the bar draws it, the floating call bar
 * clears it — and two copies of it drift the first time either changes.
 */

/** The tab bar above the safe area. The inset below is added on top of this. */
export const TAB_BAR_HEIGHT = 58;

/**
 * How much room the home indicator or the Android nav buttons need.
 *
 * A phone with no gesture bar reports zero, which would put the tab labels on
 * the very bottom edge — the floors here are what a thumb needs regardless.
 */
export function useBottomInset(): number {
  const insets = useSafeAreaInsets();
  return Math.max(insets.bottom, Platform.OS === 'android' ? 12 : 16);
}

/** Total height of the tab bar, for anything that has to float clear of it. */
export function useTabBarHeight(): number {
  return TAB_BAR_HEIGHT + useBottomInset();
}
