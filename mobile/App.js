import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import AuthScreen from './src/screens/auth/AuthScreen';
import AppTabs from './src/navigation/AppTabs';
import { useAuthStore } from './src/store/authStore';
import { colors } from './src/theme/tokens';
import { registerPushToken } from './src/api';

export default function App() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loading = useAuthStore((state) => state.loading);
  const token = useAuthStore((state) => state.token);
  const restoreSession = useAuthStore((state) => state.restoreSession);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
    Inter_700Bold
  });

  useEffect(() => {
    console.log('[MobileApp] hydration changed:', hydrated);
    if (hydrated) {
      console.log('[MobileApp] restoring session...');
      restoreSession();
    }
  }, [hydrated, restoreSession]);

  useEffect(() => {
    async function setupPush() {
      if (!isAuthenticated || !token) return;

      try {
        const { registerForPushNotificationsAsync } = await import('./src/notifications/push');
        if (typeof registerForPushNotificationsAsync !== 'function') {
          console.log('[MobileApp] push_registration_unavailable');
          return;
        }
        const expoPushToken = await registerForPushNotificationsAsync();
        if (!expoPushToken) {
          return;
        }

        await registerPushToken(expoPushToken, token);
        console.log('[MobileApp] push_token_registered');
      } catch (error) {
        console.log('[MobileApp] push_token_register_error', { message: error?.message || 'unknown' });
      }
    }

    setupPush();
  }, [isAuthenticated, token]);

  if (!fontsLoaded || !hydrated || loading) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Preparing secure session...</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <View style={styles.root}>
          <StatusBar barStyle="dark-content" />
          {isAuthenticated ? <AppTabs /> : <AuthScreen />}
        </View>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'android' ? 2 : 0
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    gap: 12
  },
  loadingText: {
    fontFamily: 'Inter_400Regular',
    color: '#64748b'
  }
});
