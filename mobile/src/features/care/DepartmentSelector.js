import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { colors, radii, spacing } from '../../theme/tokens';

export default function DepartmentSelector({ departments = [], selectedDepartmentId, onSelect }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Select Department</Text>
      <FlatList
        data={departments}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        renderItem={({ item }) => {
          const active = item.id === selectedDepartmentId;
          return (
            <TouchableOpacity
              style={[styles.item, active && styles.itemActive]}
              onPress={() => onSelect(item)}
            >
              <Text style={[styles.itemText, active && styles.itemTextActive]}>{item.name}</Text>
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
  itemText: { fontFamily: 'Inter_600SemiBold', color: colors.text },
  itemTextActive: { color: colors.primaryDark }
});
