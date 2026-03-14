import Constants from 'expo-constants';
import * as Device from 'expo-device';

let notificationsHandlerInitialized = false;

async function loadNotificationsModule() {
  try {
    const Notifications = await import('expo-notifications');
    return Notifications;
  } catch (error) {
    console.log('[Push] expo-notifications module unavailable', { message: error?.message || 'unknown error' });
    return null;
  }
}

async function ensureNotificationHandler(Notifications) {
  if (notificationsHandlerInitialized) return;
  if (!Notifications || typeof Notifications?.setNotificationHandler !== 'function') return;

  try {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false
      })
    });
    notificationsHandlerInitialized = true;
  } catch (error) {
    console.log('[Push] notification handler setup skipped', { message: error?.message || 'unknown error' });
  }
}

export async function registerForPushNotificationsAsync() {
  const appOwnership = String(Constants?.appOwnership || '').toLowerCase();
  if (appOwnership === 'expo') {
    // Expo Go (SDK 53+) no longer supports remote push token registration.
    console.log('[Push] remote push skipped in Expo Go; use a development build for push notifications');
    return null;
  }

  const Notifications = await loadNotificationsModule();
  await ensureNotificationHandler(Notifications);

  if (
    !Notifications
    || typeof Notifications.getPermissionsAsync !== 'function'
    || typeof Notifications.requestPermissionsAsync !== 'function'
    || typeof Notifications.getExpoPushTokenAsync !== 'function'
  ) {
    console.log('[Push] expo-notifications API not available in this runtime');
    return null;
  }

  if (!Device.isDevice) {
    console.log('[Push] physical device required for push notifications');
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('[Push] notification permission not granted');
    return null;
  }

  if (Device.osName === 'Android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0f766e'
    });
  }

  const projectId =
    Constants?.expoConfig?.extra?.eas?.projectId
    || Constants?.easConfig?.projectId
    || undefined;

  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return tokenResponse?.data || null;
  } catch (error) {
    console.log('[Push] getExpoPushTokenAsync failed', { message: error?.message || 'unknown error' });
    return null;
  }
}
