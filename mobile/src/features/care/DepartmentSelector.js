import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { colors, radii, spacing } from '../../theme/tokens';

export default function DepartmentSelector({ departments = [], selectedDepartmentId, onSelect }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Select Department</Text>
      <FlatList
        data={departments}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => {
          const active = item.id === selectedDepartmentId;
          return (
            <View>
              <TouchableOpacity
                style={[styles.item, active && styles.itemActive]}
                onPress={() => onSelect(item)}
                activeOpacity={0.86}
              >
                <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                  <MaterialCommunityIcons name="hospital-box-outline" size={18} color={active ? '#ffffff' : colors.primaryDark} />
                </View>
                <View style={styles.textWrap}>
                  <Text style={[styles.itemText, active && styles.itemTextActive]}>{item.name}</Text>
                  <Text style={styles.itemMeta}>Tap to continue with this department</Text>
                </View>
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginHorizontal: spacing.lg, marginBottom: spacing.md },
  title: { fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 21, marginBottom: spacing.md },
  listContent: { gap: spacing.sm },
  item: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: spacing.md,
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center'
  },
  itemActive: { borderColor: colors.primary, backgroundColor: '#e8f4f1' },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconWrapActive: {
    backgroundColor: colors.primary
  },
  textWrap: {
    flex: 1,
    marginLeft: spacing.sm
  },
  itemText: { fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 15 },
  itemTextActive: { color: colors.primaryDark },
  itemMeta: {
    marginTop: 3,
    fontFamily: 'Inter_400Regular',
    color: colors.muted,
    fontSize: 12
  }
});
