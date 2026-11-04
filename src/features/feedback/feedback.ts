import { AccessibilityInfo } from 'react-native';
import { trigger } from 'react-native-haptic-feedback';

const options = { enableVibrateFallback: true, ignoreAndroidSystemSettings: false };

/**
 * Haptics are a supplement only. Every call also has visible text, and
 * important events are announced for screen readers.
 */
export const feedback = {
  success(announcement?: string) {
    trigger('notificationSuccess', options);
    if (announcement) AccessibilityInfo.announceForAccessibility(announcement);
  },
  warning(announcement?: string) {
    trigger('notificationWarning', options);
    if (announcement) AccessibilityInfo.announceForAccessibility(announcement);
  },
  announce(text: string) {
    AccessibilityInfo.announceForAccessibility(text);
  },
};
