import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '../../theme/tokens';

export default function DoctorSelector({ doctors = [], selectedDoctorId, onSelect }) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Select Doctor</Text>
      <FlatList
        data={doctors}
        keyExtractor={(item) => item.id}
        scrollEnabled={false}
        contentContainerStyle={styles.listContent}
        renderItem={({ item, index }) => {
          const active = item.id === selectedDoctorId;
          return (
            <View>
              <TouchableOpacity style={[styles.item, active && styles.itemActive]} onPress={() => onSelect(item)} activeOpacity={0.86}>
                <View style={[styles.iconWrap, active && styles.iconWrapActive]}>
                  <Ionicons name="person-outline" size={18} color={active ? '#ffffff' : colors.primaryDark} />
                </View>
                <View style={styles.contentWrap}>
                  <Text style={[styles.name, active && styles.nameActive]}>{item.name}</Text>
                  <Text style={styles.meta}>{item.specialty || 'General'} • {item.yearsOfExperience || 0} yrs experience</Text>
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
  contentWrap: {
    flex: 1,
    marginLeft: spacing.sm
  },
  name: { fontFamily: 'Inter_700Bold', color: colors.text, fontSize: 15 },
  nameActive: { color: colors.primaryDark },
  meta: { marginTop: 4, fontFamily: 'Inter_400Regular', color: colors.muted, fontSize: 12 }
});
