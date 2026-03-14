import React from 'react';
import { DeviceEventEmitter, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { colors, radii, spacing } from '../../theme/tokens';

export default function ProfileScreen() {
  function emitScroll(event) {
    DeviceEventEmitter.emit('app:tab-scroll', { y: event?.nativeEvent?.contentOffset?.y || 0 });
  }

  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      onScroll={emitScroll}
      scrollEventThrottle={16}
    >
      <Text style={styles.title}>Profile</Text>

      <View style={styles.card}>
        <Text style={styles.label}>Name</Text>
        <Text style={styles.value}>{user?.name || 'Patient'}</Text>

        <Text style={styles.label}>Email</Text>
        <Text style={styles.value}>{user?.email || 'No email'}</Text>

        <Text style={styles.label}>Role</Text>
        <Text style={styles.value}>{user?.role || 'PATIENT'}</Text>
      </View>

      <TouchableOpacity style={styles.logout} onPress={logout}>
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  content: { paddingBottom: spacing.xl },
  title: { fontFamily: 'Inter_700Bold', fontSize: 26, color: colors.text },
  card: { marginTop: spacing.lg, backgroundColor: '#fff', borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  label: { marginTop: spacing.sm, fontFamily: 'Inter_600SemiBold', color: colors.primaryDark },
  value: { marginTop: 2, fontFamily: 'Inter_400Regular', color: colors.text },
  logout: { marginTop: spacing.xl, backgroundColor: '#4d6270', borderRadius: radii.md, alignItems: 'center', paddingVertical: 12 },
  logoutText: { fontFamily: 'Inter_600SemiBold', color: '#fff' }
});
