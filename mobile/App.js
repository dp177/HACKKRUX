import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useFonts, Inter_400Regular, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { useAuthStore } from './src/store/authStore';

const FUTURE_MODULES = [
  { key: 'history', title: 'Medical History', subtitle: 'Attach long-term records to your profile' },
  { key: 'triage', title: 'Triage Submissions', subtitle: 'Submit symptoms and vitals for AI triage' },
  { key: 'queue', title: 'Queue Tracking', subtitle: 'Track real-time queue and wait updates' },
  { key: 'search', title: 'Hospital Search', subtitle: 'Discover hospitals, departments, and doctors' },
  { key: 'appointments', title: 'Appointments', subtitle: 'Book, reschedule, and manage visits' }
];

function AuthScreen() {
  const loading = useAuthStore((state) => state.loading);
  const loginWithToken = useAuthStore((state) => state.loginWithToken);
  const [polling, setPolling] = useState(false);

  const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.51.198.215:5000/api';

  async function handleGoogleLogin() {
    const sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const authUrl = `${API_BASE}/auth/google/mobile?sessionId=${sessionId}`;

    setPolling(true);
    await WebBrowser.openBrowserAsync(authUrl);

    // Browser closed — poll for result (up to 10 × 500 ms = 5 seconds)
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 500));
      try {
        const res = await fetch(`${API_BASE}/auth/google/mobile/result?sessionId=${sessionId}`);
        const data = await res.json();
        if (data.status === 'success') {
          setPolling(false);
          loginWithToken(data.token, data.user);
          return;
        } else if (data.status === 'error') {
          break;
        }
        // status === 'pending' — keep polling
      } catch (_) {}
    }

    setPolling(false);
    Alert.alert('Sign-in failed', 'Could not complete Google sign-in. Please try again.');
  }

  const busy = loading || polling;

  return (
    <View style={styles.screenCenter}>
      <View style={styles.card}>
        <Text style={styles.kicker}>Patient App</Text>
        <Text style={styles.title}>Continue with Google</Text>
        <Text style={styles.subtitle}>
          Secure, fast sign-in for triage, queue updates, and appointments.
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
          disabled={busy}
          onPress={handleGoogleLogin}
        >
          <Text style={styles.primaryButtonText}>{busy ? 'Signing in...' : 'Continue with Google'}</Text>
        </TouchableOpacity>

        <Text style={styles.helperText}>
          Google OAuth only. JWT session is restored automatically.
        </Text>
      </View>
    </View>
  );
}

function AuthenticatedShell() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  return (
    <ScrollView contentContainerStyle={styles.shellContainer}>
      <View style={styles.headerCard}>
        <Text style={styles.kicker}>Authenticated</Text>
        <Text style={styles.welcomeTitle}>Welcome {user?.name || 'Patient'}</Text>
        <Text style={styles.userMeta}>{user?.email || 'No email available'}</Text>
        <View style={styles.rolePill}>
          <Text style={styles.rolePillText}>{user?.role || 'PATIENT'}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Upcoming Modules</Text>
      {FUTURE_MODULES.map((module) => (
        <View key={module.key} style={styles.moduleCard}>
          <Text style={styles.moduleTitle}>{module.title}</Text>
          <Text style={styles.moduleSubtitle}>{module.subtitle}</Text>
        </View>
      ))}

      <TouchableOpacity style={styles.secondaryButton} onPress={logout}>
        <Text style={styles.secondaryButtonText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

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
    if (hydrated) {
      restoreSession();
    }
  }, [hydrated, restoreSession]);

  if (!fontsLoaded || !hydrated || loading) {
    return (
      <View style={styles.loadingScreen}>
        <StatusBar barStyle="dark-content" />
        <ActivityIndicator size="large" color="#2f7d5b" />
        <Text style={styles.loadingText}>Preparing secure session...</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      {isAuthenticated ? <AuthenticatedShell /> : <AuthScreen />}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f2f7f5',
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0
  },
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f2f7f5',
    gap: 12
  },
  loadingText: {
    fontFamily: 'Inter_400Regular',
    color: '#64748b'
  },
  screenCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#dbe7e0',
    backgroundColor: '#ffffff',
    padding: 22,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3
  },
  kicker: {
    fontFamily: 'Inter_600SemiBold',
    color: '#2f7d5b',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontSize: 12,
    marginBottom: 8
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 28,
    color: '#0f172a',
    marginBottom: 8
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    color: '#475569',
    lineHeight: 22,
    marginBottom: 18
  },
  primaryButton: {
    backgroundColor: '#2f7d5b',
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: 'center'
  },
  primaryButtonDisabled: {
    opacity: 0.6
  },
  primaryButtonText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#ffffff',
    fontSize: 15
  },
  helperText: {
    fontFamily: 'Inter_400Regular',
    marginTop: 12,
    color: '#64748b',
    fontSize: 12
  },
  shellContainer: {
    padding: 18,
    gap: 12
  },
  headerCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#dbe7e0',
    backgroundColor: '#ffffff',
    padding: 18
  },
  welcomeTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 24,
    color: '#0f172a'
  },
  userMeta: {
    fontFamily: 'Inter_400Regular',
    marginTop: 6,
    color: '#475569'
  },
  rolePill: {
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#dff3e9'
  },
  rolePillText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#1f6a49',
    fontSize: 12
  },
  sectionTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 18,
    color: '#0f172a',
    marginTop: 2
  },
  moduleCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbe7e0',
    backgroundColor: '#ffffff',
    padding: 14
  },
  moduleTitle: {
    fontFamily: 'Inter_600SemiBold',
    color: '#0f172a',
    fontSize: 15
  },
  moduleSubtitle: {
    fontFamily: 'Inter_400Regular',
    color: '#64748b',
    marginTop: 4,
    lineHeight: 20
  },
  secondaryButton: {
    marginTop: 8,
    borderRadius: 14,
    backgroundColor: '#475569',
    alignItems: 'center',
    paddingVertical: 12
  },
  secondaryButtonText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#ffffff'
  }
});
