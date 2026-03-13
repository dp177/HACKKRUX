import React, { useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuthStore } from '../../store/authStore';
import { colors, radii, spacing } from '../../theme/tokens';

export default function AuthScreen() {
  const loading = useAuthStore((state) => state.loading);
  const loginWithToken = useAuthStore((state) => state.loginWithToken);
  const [polling, setPolling] = useState(false);
  const authInFlightRef = useRef(false);

  const API_BASE = process.env.EXPO_PUBLIC_API_BASE_URL || 'http://10.51.198.215:5000/api';

  async function handleGoogleLogin() {
    if (authInFlightRef.current || loading || polling) {
      return;
    }

    authInFlightRef.current = true;
    const sessionId = Math.random().toString(36).slice(2) + Date.now().toString(36);
    const authUrl = `${API_BASE}/auth/google/mobile?sessionId=${sessionId}`;

    console.log('[AuthScreen] oauth_start', { sessionId, authUrl });

    try {
      setPolling(true);
      await WebBrowser.openBrowserAsync(authUrl);
      console.log('[AuthScreen] browser_closed_polling_start', { sessionId });

      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        try {
          const res = await fetch(`${API_BASE}/auth/google/mobile/result?sessionId=${sessionId}`);
          const data = await res.json();
          console.log('[AuthScreen] poll_result', { sessionId, index: i, status: data?.status });
          if (data.status === 'success') {
            setPolling(false);
            console.log('[AuthScreen] oauth_success', { sessionId });
            loginWithToken(data.token, data.user);
            return;
          }
          if (data.status === 'error') break;
        } catch (_) {}
      }

      setPolling(false);
      console.log('[AuthScreen] oauth_failed', { sessionId });
      Alert.alert('Sign-in failed', 'Could not complete Google sign-in. Please try again.');
    } finally {
      authInFlightRef.current = false;
      setPolling(false);
    }
  }

  const busy = loading || polling;

  return (
    <View style={styles.root}>
      <LinearGradient colors={['#d7f2eb', '#f4f8f7']} style={styles.hero}>
        <Text style={styles.brand}>Jeeva Triage</Text>
        <Text style={styles.headline}>Care starts before the waiting room.</Text>
      </LinearGradient>

      <View style={styles.card}>
        <Text style={styles.title}>Continue with Google</Text>
        <Text style={styles.subtitle}>Secure sign-in for triage, live queue updates, and appointments.</Text>

        <TouchableOpacity
          style={[styles.primaryButton, busy && styles.primaryButtonDisabled]}
          disabled={busy}
          onPress={handleGoogleLogin}
        >
          <Text style={styles.primaryButtonText}>{busy ? 'Signing in...' : 'Continue'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background
  },
  hero: {
    height: 280,
    paddingHorizontal: spacing.xl,
    paddingTop: 90
  },
  brand: {
    fontFamily: 'Inter_700Bold',
    color: colors.primaryDark,
    fontSize: 16,
    textTransform: 'uppercase',
    letterSpacing: 1.2
  },
  headline: {
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    fontSize: 32,
    marginTop: 12,
    lineHeight: 40,
    maxWidth: 320
  },
  card: {
    marginHorizontal: spacing.lg,
    marginTop: -46,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.border
  },
  title: {
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    fontSize: 24
  },
  subtitle: {
    fontFamily: 'Inter_400Regular',
    color: colors.muted,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
    lineHeight: 21
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radii.md,
    paddingVertical: 13,
    alignItems: 'center'
  },
  primaryButtonDisabled: {
    opacity: 0.7
  },
  primaryButtonText: {
    fontFamily: 'Inter_600SemiBold',
    color: '#fff',
    fontSize: 15
  }
});
