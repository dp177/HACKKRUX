import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { colors, radii, spacing } from '../../theme/tokens';

export default function TopBar({
  mode = 'title',
  title = '',
  greeting = '',
  subtitle = '',
  onBack,
  onMenu,
  onProfile,
  avatarLabel = ''
}) {
  const initials = String(avatarLabel || 'PT')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.leftArea}>
          {onBack ? (
            <TouchableOpacity style={styles.iconButton} onPress={onBack} activeOpacity={0.8}>
              <Ionicons name="arrow-back" size={20} color={colors.text} />
            </TouchableOpacity>
          ) : onMenu ? (
            <TouchableOpacity style={styles.iconButton} onPress={onMenu} activeOpacity={0.8}>
              <Feather name="menu" size={19} color={colors.text} />
            </TouchableOpacity>
          ) : (
            <View style={styles.iconButtonPlaceholder} />
          )}
        </View>

        {mode === 'home' ? (
          <View style={styles.centerHome}>
            <Text style={styles.greeting} numberOfLines={1}>{greeting}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
        ) : (
          <View style={styles.centerTitle}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
          </View>
        )}

        <View style={styles.rightArea}>
          <TouchableOpacity style={styles.avatar} onPress={onProfile} activeOpacity={0.8}>
            <Text style={styles.avatarText}>{initials || 'PT'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border
  },
  container: {
    minHeight: 52,
    paddingHorizontal: spacing.lg,
    paddingVertical: 2,
    flexDirection: 'row',
    alignItems: 'center'
  },
  leftArea: {
    width: 42,
    alignItems: 'flex-start',
    justifyContent: 'center'
  },
  centerHome: {
    flex: 1,
    paddingHorizontal: spacing.sm
  },
  centerTitle: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  rightArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs
  },
  iconButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center'
  },
  iconButtonPlaceholder: {
    width: 34,
    height: 34
  },
  greeting: {
    fontFamily: 'Inter_700Bold',
    fontSize: 19,
    color: colors.text
  },
  subtitle: {
    marginTop: 2,
    fontFamily: 'Inter_400Regular',
    fontSize: 12,
    color: colors.muted
  },
  title: {
    fontFamily: 'Inter_700Bold',
    fontSize: 16,
    color: colors.text
  },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatarText: {
    fontFamily: 'Inter_700Bold',
    color: '#ffffff',
    fontSize: 12
  }
});
