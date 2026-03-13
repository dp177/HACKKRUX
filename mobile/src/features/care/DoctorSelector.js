import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing } from '../../theme/tokens';

export default function DoctorSelector({ doctors = [], selectedDoctorId, onSelect }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Select Doctor</Text>
      <FlatList
        data={doctors}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => {
          const active = item.id === selectedDoctorId;
          return (
            <TouchableOpacity style={[styles.item, active && styles.itemActive]} onPress={() => onSelect(item)}>
              <Text style={[styles.name, active && styles.nameActive]}>{item.name}</Text>
              <Text style={styles.meta}>{item.specialty || 'General'} • {item.yearsOfExperience || 0} yrs</Text>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: spacing.lg, marginBottom: spacing.md },
  title: { fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 18, marginBottom: spacing.sm },
  item: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.border, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
  itemActive: { borderColor: colors.primary, backgroundColor: '#e8f4f1' },
  name: { fontFamily: 'Inter_600SemiBold', color: colors.text },
  nameActive: { color: colors.primaryDark },
  meta: { marginTop: 4, fontFamily: 'Inter_400Regular', color: colors.muted }
});
