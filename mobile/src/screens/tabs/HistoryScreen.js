import React, { useEffect, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, FlatList, StyleSheet, Text, View } from 'react-native';
import { getCurrentUser, getPatientDashboard } from '../../api';
import { useAuthStore } from '../../store/authStore';
import { colors, radii, spacing } from '../../theme/tokens';

export default function HistoryScreen() {
    function emitScroll(event) {
      DeviceEventEmitter.emit('app:tab-scroll', { y: event?.nativeEvent?.contentOffset?.y || 0 });
    }

  const token = useAuthStore((state) => state.token);
  const [loading, setLoading] = useState(true);
  const [visits, setVisits] = useState([]);

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        const me = await getCurrentUser(token);
        const dashboard = await getPatientDashboard(me.user.id, token);
        setVisits(dashboard?.visitHistory?.recentVisits || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Medical History</Text>
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={visits}
          keyExtractor={(item) => item.id}
          onScroll={emitScroll}
          scrollEventThrottle={16}
          contentContainerStyle={{ paddingBottom: 16 }}
          renderItem={({ item }) => (
            <View style={styles.itemCard}>
              <Text style={styles.itemTitle}>{item.chiefComplaint || 'General visit'}</Text>
              <Text style={styles.itemSub}>{new Date(item.date).toLocaleDateString()} • {item.department || 'General'}</Text>
              <Text style={styles.itemSub}>Diagnosis: {item.diagnosis || 'Pending'}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No past visits found.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 26, marginBottom: spacing.md },
  itemCard: { marginTop: spacing.sm, backgroundColor: '#fff', borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  itemTitle: { fontFamily: 'Inter_600SemiBold', color: colors.text },
  itemSub: { fontFamily: 'Inter_400Regular', color: colors.muted, marginTop: 4 },
  empty: { marginTop: spacing.lg, color: colors.muted, fontFamily: 'Inter_400Regular', textAlign: 'center' }
});
