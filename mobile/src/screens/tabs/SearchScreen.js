import React, { useEffect, useState } from 'react';
import { ActivityIndicator, DeviceEventEmitter, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getHospitals } from '../../api';
import { colors, radii, spacing } from '../../theme/tokens';

export default function SearchScreen() {
    function emitScroll(event) {
      DeviceEventEmitter.emit('app:tab-scroll', { y: event?.nativeEvent?.contentOffset?.y || 0 });
    }

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [hospitals, setHospitals] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const data = await getHospitals();
        setHospitals(data?.hospitals || []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = hospitals.filter((h) => {
    const q = query.toLowerCase();
    return !q || h.name.toLowerCase().includes(q) || String(h.city || '').toLowerCase().includes(q);
  });

  return (
    <View style={styles.root}>
      <Text style={styles.title}>Search Hospitals</Text>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color="#6d7f88" />
        <TextInput
          placeholder="Type hospital name"
          value={query}
          onChangeText={setQuery}
          style={styles.input}
          placeholderTextColor="#88a0ab"
        />
      </View>

      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          onScroll={emitScroll}
          scrollEventThrottle={16}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.itemCard} activeOpacity={0.85}>
              <Text style={styles.itemTitle}>{item.name}</Text>
              <Text style={styles.itemSub}>{item.city || 'City not set'} • {item.state || 'State not set'}</Text>
            </TouchableOpacity>
          )}
          ListEmptyComponent={<Text style={styles.empty}>No hospitals match your search.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, padding: spacing.lg },
  title: { fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 26 },
  searchBox: { marginTop: spacing.md, backgroundColor: '#fff', borderRadius: radii.md, borderColor: colors.border, borderWidth: 1, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center' },
  input: { flex: 1, marginLeft: 8, paddingVertical: 10, fontFamily: 'Inter_400Regular', color: colors.text },
  itemCard: { marginTop: spacing.sm, backgroundColor: '#fff', borderRadius: radii.md, borderWidth: 1, borderColor: colors.border, padding: spacing.md },
  itemTitle: { fontFamily: 'Inter_600SemiBold', color: colors.text },
  itemSub: { marginTop: 4, fontFamily: 'Inter_400Regular', color: colors.muted },
  empty: { marginTop: spacing.lg, color: colors.muted, fontFamily: 'Inter_400Regular', textAlign: 'center' }
});
