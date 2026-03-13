import React, { useEffect } from 'react';
import { ActivityIndicator, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import AuthScreen from './src/screens/auth/AuthScreen';
import AppTabs from './src/navigation/AppTabs';
import { useAuthStore } from './src/store/authStore';
import { colors } from './src/theme/tokens';

export default function App() {
  const hydrated = useAuthStore((state) => state.hydrated);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const loading = useAuthStore((state) => state.loading);
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
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      {isAuthenticated ? <AppTabs /> : <AuthScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0
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
