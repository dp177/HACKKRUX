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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeScreen from '../screens/tabs/HomeScreen';
import SearchScreen from '../screens/tabs/SearchScreen';
import QueueScreen from '../screens/tabs/QueueScreen';
import AppointmentsScreen from '../screens/tabs/AppointmentsScreen';
import HistoryScreen from '../screens/tabs/HistoryScreen';
import ProfileScreen from '../screens/tabs/ProfileScreen';
import HelpScreen from '../screens/tabs/HelpScreen';
import TopBar from '../components/home/TopBar';
import { useAuthStore } from '../store/authStore';
import { colors } from '../theme/tokens';

const TABS = [
  { key: 'Home', label: 'Home', icon: 'home', component: HomeScreen },
  { key: 'Search', label: 'Find', icon: 'search-outline', component: SearchScreen },
  { key: 'Queue', label: 'Queue', icon: 'pulse-outline', component: QueueScreen },
  { key: 'Appointments', label: 'Appts', icon: 'calendar-outline', component: AppointmentsScreen }
];

const ICON_ACTIVE = {
  Home: 'home',
  Search: 'search-outline',
  Queue: 'pulse-outline',
  Appointments: 'calendar-outline'
};

const MENU_ITEMS = [
  { key: 'MedicalHistory', label: 'Medical History' },
  { key: 'AppointmentHistory', label: 'Appointment History' },
  { key: 'UploadReports', label: 'Upload Reports' },
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
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = React.useState('Home');
  const [menuOpen, setMenuOpen] = React.useState(false);
  const [auxScreen, setAuxScreen] = React.useState('');
  const translateY = React.useRef(new Animated.Value(0)).current;
  const opacity = React.useRef(new Animated.Value(1)).current;
  const hiddenRef = React.useRef(false);
  const lastOffsetRef = React.useRef(0);
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);

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

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener('app:open-menu', () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMenuOpen(true);
    });

    return () => sub.remove();
  }, []);

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener('app:open-profile', () => {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setMenuOpen(false);
      setAuxScreen('Profile');
    });

    return () => sub.remove();
  }, []);

  React.useEffect(() => {
    const sub = DeviceEventEmitter.addListener('app:switch-tab', (payload) => {
      const nextTab = String(payload?.tab || '');
      if (!TABS.some((tab) => tab.key === nextTab)) return;

      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
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
      setActiveTab(nextTab);
      setMenuOpen(false);
      console.log('[MobileApp] tab_change_event', { nextTab });
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
    if (auxScreen === 'Settings') {
      return <PlaceholderScreen title="Settings" subtitle="Preferences, language and app options can be managed here." />;
    }
    if (auxScreen === 'Help') {
      return <HelpScreen />;
    }
    if (auxScreen === 'Profile') {
      return <ProfileScreen />;
    }
    return null;
  }, [auxScreen]);

  const showTopBar = activeTab !== 'Home' || Boolean(auxScreen);
  const auxTitleMap = {
    MedicalHistory: 'Medical History',
    AppointmentHistory: 'Appointment History',
    UploadReports: 'Upload Reports',
    Settings: 'Settings',
    Help: 'Help',
    Profile: 'Profile'
  };
  const topBarTitle = auxScreen
    ? (auxTitleMap[auxScreen] || 'Menu')
    : (activeTab === 'Search' ? 'Search' : activeTab === 'Queue' ? 'Queue' : activeTab === 'Appointments' ? 'Appointments' : 'Home');
  const menuTopOffset = showTopBar ? insets.top + 53 : 0;

  return (
    <View style={styles.root}>
      {showTopBar ? (
        <TopBar
          title={topBarTitle}
          onBack={auxScreen ? () => setAuxScreen('') : undefined}
          onMenu={auxScreen ? undefined : () => setMenuOpen(true)}
          onProfile={() => setAuxScreen('Profile')}
          avatarLabel={user?.name || 'Patient'}
        />
      ) : null}

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
              style={styles.tabItem}
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
                <Ionicons name={iconName} color={active ? '#ffffff' : colors.primaryDark} size={18} />
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
        <View style={[styles.menuOverlay, { top: menuTopOffset }]}>
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
          <TouchableOpacity style={styles.menuBackdrop} activeOpacity={1} onPress={() => setMenuOpen(false)} />
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
    flex: 1
  },
  tabBarWrap: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 20,
    backgroundColor: 'transparent'
  },
  tabBar: {
    position: 'relative',
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#ffffffee',
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    minHeight: 72,
    paddingHorizontal: 6,
    paddingVertical: 6,
    alignItems: 'center',
    overflow: 'hidden'
  },
  tabItem: {
    flex: 1,
    height: 60,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 2
  },
  tabInner: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 10
  },
  tabInnerActive: {
    backgroundColor: colors.primary,
    width: '108%',
    height: '100%',
    borderRadius: 999,
    alignSelf: 'center'
  },
  tabLabel: {
    color: colors.primaryDark,
    fontFamily: 'Inter_600SemiBold',
    fontSize: 11,
    flexShrink: 1
  },
  tabLabelActive: {
    color: '#f3fffb',
    fontFamily: 'Inter_700Bold',
    fontSize: 11,
    flexShrink: 1
  },
  menuOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
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
    borderRightWidth: 1,
    borderRightColor: colors.border,
    borderLeftWidth: 0,
    padding: 18,
    gap: 8
  },
  menuTitle: {
    fontFamily: 'Inter_700Bold',
    fontSize: 20,
    color: colors.text,
    marginBottom: 8
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
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
