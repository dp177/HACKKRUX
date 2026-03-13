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
import AppointmentsScreen from '../screens/tabs/AppointmentsScreen';
import HistoryScreen from '../screens/tabs/HistoryScreen';
import ProfileScreen from '../screens/tabs/ProfileScreen';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/tokens';

const TABS = [
  { key: 'Home', label: 'Home', icon: 'home-outline', component: HomeScreen },
  { key: 'Search', label: 'Find', icon: 'search-outline', component: SearchScreen },
  { key: 'Queue', label: 'Queue', icon: 'pulse-outline', component: QueueScreen },
  { key: 'Appointments', label: 'Appts', icon: 'calendar-outline', component: AppointmentsScreen },
  { key: 'Profile', label: 'Me', icon: 'person-outline', component: ProfileScreen }
];

const ICON_ACTIVE = {
  Home: 'home-outline',
  Search: 'search-outline',
  Queue: 'pulse-outline',
  Appointments: 'calendar-outline',
  Profile: 'person-outline'
};

const MENU_ITEMS = [
  { key: 'MedicalHistory', label: 'Medical History' },
  { key: 'AppointmentHistory', label: 'Appointment History' },
  { key: 'UploadReports', label: 'Upload Reports' },
  { key: 'Notifications', label: 'Notifications' },
  { key: 'Settings', label: 'Settings' },
  { key: 'Help', label: 'Help' },
  { key: 'Logout', label: 'Logout' }
];

function PlaceholderScreen({ title, subtitle }) {
  return (
    <View style={styles.placeholderWrap}>
      <Text style={styles.placeholderTitle}>{title}</Text>
      <Text style={styles.placeholderSubtitle}>{subtitle}</Text>
    </View>
  );
}

export default function AppTabs() {
  const [activeTab, setActiveTab] = React.useState('Home');
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [auxScreen, setAuxScreen] = React.useState('');
  const translateY = React.useRef(new Animated.Value(0)).current;
  const opacity = React.useRef(new Animated.Value(1)).current;
  const hiddenRef = React.useRef(false);
  const lastOffsetRef = React.useRef(0);
  const logout = useAuthStore((state) => state.logout);

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

  const AuxScreenComponent = React.useMemo(() => {
    if (auxScreen === 'MedicalHistory') {
      return <HistoryScreen />;
    }
    if (auxScreen === 'AppointmentHistory') {
      return <AppointmentsScreen mode="history" />;
    }
    if (auxScreen === 'UploadReports') {
      return <PlaceholderScreen title="Upload Reports" subtitle="Lab reports, prescriptions and scans upload can be managed here." />;
    }
    if (auxScreen === 'Notifications') {
      return <PlaceholderScreen title="Notifications" subtitle="Appointment reminders, queue updates and doctor delay alerts appear here." />;
    }
    if (auxScreen === 'Settings') {
      return <PlaceholderScreen title="Settings" subtitle="Preferences, language and app options can be managed here." />;
    }
    if (auxScreen === 'Help') {
      return <PlaceholderScreen title="Help" subtitle="Support and FAQ are available here." />;
    }
    return null;
  }, [auxScreen]);

  return (
    <View style={styles.root}>
      <View style={styles.menuToggleWrap}>
        <TouchableOpacity style={styles.menuToggle} onPress={() => setMenuOpen(true)}>
          <Ionicons name="menu-outline" size={22} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {auxScreen ? AuxScreenComponent : <ActiveScreen />}
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
                setAuxScreen('');
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

      {menuOpen ? (
        <View style={styles.menuOverlay}>
          <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setMenuOpen(false)} />
          <View style={styles.menuPanel}>
            <Text style={styles.menuTitle}>Menu</Text>
            {MENU_ITEMS.map((item) => (
              <TouchableOpacity
                key={item.key}
                style={styles.menuItem}
                onPress={async () => {
                  setMenuOpen(false);
                  if (item.key === 'Logout') {
                    await logout();
                    return;
                  }

                  setAuxScreen(item.key);
                }}
              >
                <Text style={styles.menuItemText}>{item.label}</Text>
              </TouchableOpacity>
            ))}

            {auxScreen ? (
              <TouchableOpacity style={styles.menuCloseAuxBtn} onPress={() => setAuxScreen('')}>
                <Text style={styles.menuCloseAuxText}>Back To Main Tabs</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flex: 1,
    paddingTop: 52
  },
  menuToggleWrap: {
    position: 'absolute',
    top: 8,
    right: 16,
    zIndex: 20
  },
  menuToggle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fff'
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
    borderRadius: 40,
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
  },
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 30,
    flexDirection: 'row'
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)'
  },
  menuPanel: {
    width: 270,
    backgroundColor: '#fff',
    borderLeftWidth: 1,
    borderLeftColor: colors.border,
    padding: 16,
    gap: 8
  },
  menuTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: colors.text,
    marginBottom: 8
  },
  menuItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: colors.surfaceAlt
  },
  menuItemText: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.text
  },
  menuCloseAuxBtn: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    paddingVertical: 10
  },
  menuCloseAuxText: {
    fontFamily: 'Inter_600SemiBold',
    color: colors.primaryDark
  },
  placeholderWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20
  },
  placeholderTitle: {
    fontFamily: 'Inter_700Bold',
    color: colors.text,
    fontSize: 22
  },
  placeholderSubtitle: {
    marginTop: 8,
    fontFamily: 'Inter_400Regular',
    color: colors.muted,
    textAlign: 'center'
  }
});
