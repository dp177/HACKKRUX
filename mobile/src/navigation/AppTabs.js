import React from 'react';
import {
  Animated,
  DeviceEventEmitter,
  Easing,
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import HomeScreen from '../screens/tabs/HomeScreen';
import SearchScreen from '../screens/tabs/SearchScreen';
import QueueScreen from '../screens/tabs/QueueScreen';
import HistoryScreen from '../screens/tabs/HistoryScreen';
import ProfileScreen from '../screens/tabs/ProfileScreen';
import { colors } from '../theme/tokens';

const TABS = [
  { key: 'Home', label: 'Home', icon: 'home-outline', component: HomeScreen },
  { key: 'Search', label: 'Find', icon: 'search-outline', component: SearchScreen },
  { key: 'Queue', label: 'Queue', icon: 'pulse-outline', component: QueueScreen },
  { key: 'History', label: 'Logs', icon: 'time-outline', component: HistoryScreen },
  { key: 'Profile', label: 'Me', icon: 'person-outline', component: ProfileScreen }
];

const ICON_ACTIVE = {
  Home: 'home-outline',
  Search: 'search-outline',
  Queue: 'pulse-outline',
  History: 'time-outline',
  Profile: 'person-outline'
};

export default function AppTabs() {
  const [activeTab, setActiveTab] = React.useState('Home');
  const translateY = React.useRef(new Animated.Value(0)).current;
  const opacity = React.useRef(new Animated.Value(1)).current;
  const hiddenRef = React.useRef(false);
  const lastOffsetRef = React.useRef(0);

  React.useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }

    const sub = DeviceEventEmitter.addListener('app:tab-scroll', (payload) => {
      const y = Number(payload?.y || 0);
      const delta = y - lastOffsetRef.current;

      if (y <= 10 && hiddenRef.current) {
        hiddenRef.current = false;
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 0,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true
          })
        ]).start();
      } else if (delta > 9 && y > 40 && !hiddenRef.current) {
        hiddenRef.current = true;
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 120,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true
          }),
          Animated.timing(opacity, {
            toValue: 0,
            duration: 150,
            useNativeDriver: true
          })
        ]).start();
      } else if (delta < -9 && hiddenRef.current) {
        hiddenRef.current = false;
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: 0,
            duration: 220,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 180,
            useNativeDriver: true
          })
        ]).start();
      }

      lastOffsetRef.current = y;
    });

    return () => sub.remove();
  }, [opacity, translateY]);

  const ActiveScreen = React.useMemo(() => {
    return TABS.find((tab) => tab.key === activeTab)?.component || HomeScreen;
  }, [activeTab]);

  return (
    <View style={styles.root}>
      <View style={styles.content}>
        <ActiveScreen />
      </View>

      <Animated.View style={[styles.tabBarWrap, { transform: [{ translateY }], opacity }]}>
      <View style={styles.tabBar}>
        {TABS.map((tab) => {
          const active = tab.key === activeTab;
          const iconName = active ? ICON_ACTIVE[tab.key] || tab.icon : tab.icon;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.tabItem, active ? styles.tabItemActiveSlot : styles.tabItemInactiveSlot]}
              onPress={() => {
                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                console.log('[MobileApp] tab_change:', tab.key);
                hiddenRef.current = false;
                lastOffsetRef.current = 0;
                Animated.parallel([
                  Animated.timing(translateY, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true
                  }),
                  Animated.timing(opacity, {
                    toValue: 1,
                    duration: 160,
                    useNativeDriver: true
                  })
                ]).start();
                setActiveTab(tab.key);
              }}
              activeOpacity={0.8}
            >
              <View style={[styles.tabInner, active && styles.tabInnerActive]}>
                {active ? (
                  <Ionicons name={iconName} color="#ffffff" size={18} />
                ) : (
                  <View style={styles.inactiveIconCircle}>
                    <Ionicons name={iconName} color={colors.primaryDark} size={20} />
                  </View>
                )}
                {active ? (
                  <Text style={styles.tabLabelActive} numberOfLines={1} ellipsizeMode="tail">
                    {tab.label}
                  </Text>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1
  },
  tabBarWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    backgroundColor: 'transparent'
  },
  tabBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 34,
    minHeight: 88,
    paddingHorizontal: 10,
    paddingVertical: 10,
    alignItems: 'center',
    shadowColor: '#5f7380',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16
  },
  tabItem: {
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2
  },
  tabItemActiveSlot: {
    width: '26%'
  },
  tabItemInactiveSlot: {
    width: '15.5%'
  },
  tabInner: {
    width: '100%',
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabInnerActive: {
    flexDirection: 'row',
    borderRadius: 29,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 10
  },
  inactiveIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center'
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: 'Inter_600SemiBold'
  },
  tabLabelActive: {
    color: '#f6fffc',
    fontFamily: 'Inter_700Bold',
    fontSize: 12,
    flexShrink: 1
  }
});
