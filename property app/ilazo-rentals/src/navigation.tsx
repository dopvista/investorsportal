import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { NavigationContainer, type NavigatorScreenParams } from '@react-navigation/native';
import { createBottomTabNavigator, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, font } from './theme';
import { Icon } from './ui/Icon';
import { useUi } from './state/UiProvider';
import { HomeScreen } from './screens/HomeScreen';
import { UnitsScreen } from './screens/UnitsScreen';
import { UnitDetailsScreen } from './screens/UnitDetailsScreen';
import { TenantDetailsScreen } from './screens/TenantDetailsScreen';
import { TenantsScreen } from './screens/TenantsScreen';
import { MoreScreen } from './screens/MoreScreen';
import { CompanyScreen } from './screens/CompanyScreen';
import { StatementsScreen } from './screens/StatementsScreen';
import { CloudSyncScreen } from './screens/CloudSyncScreen';

export type UnitsStackParamList = {
  Units: undefined;
  UnitDetails: { unitId: string };
  TenantDetails: { unitId: string };
};

export type MoreStackParamList = {
  More: undefined;
  Company: undefined;
  Statements: undefined;
  CloudSync: undefined;
};

export type TabsParamList = {
  HomeTab: undefined;
  UnitsTab: NavigatorScreenParams<UnitsStackParamList>;
  TenantsTab: undefined;
  MoreTab: NavigatorScreenParams<MoreStackParamList>;
};

const Tabs = createBottomTabNavigator<TabsParamList>();
const UnitsStack = createNativeStackNavigator<UnitsStackParamList>();
const MoreStack = createNativeStackNavigator<MoreStackParamList>();

function UnitsStackNav() {
  return (
    <UnitsStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <UnitsStack.Screen name="Units" component={UnitsScreen} />
      <UnitsStack.Screen name="UnitDetails" component={UnitDetailsScreen} />
      <UnitsStack.Screen name="TenantDetails" component={TenantDetailsScreen} />
    </UnitsStack.Navigator>
  );
}

function MoreStackNav() {
  return (
    <MoreStack.Navigator screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
      <MoreStack.Screen name="More" component={MoreScreen} />
      <MoreStack.Screen name="Company" component={CompanyScreen} />
      <MoreStack.Screen name="Statements" component={StatementsScreen} />
      <MoreStack.Screen name="CloudSync" component={CloudSyncScreen} />
    </MoreStack.Navigator>
  );
}

const TAB_META: Record<string, { icon: string; label: string }> = {
  HomeTab: { icon: 'home', label: 'Home' },
  UnitsTab: { icon: 'apartment', label: 'Units' },
  TenantsTab: { icon: 'groups', label: 'Tenants' },
  MoreTab: { icon: 'menu', label: 'More' },
};

/** Custom bottom bar: 4 tabs + the central Record-payment FAB. */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { openSheet } = useUi();

  const renderTab = (routeName: keyof TabsParamList, index: number) => {
    const meta = TAB_META[routeName];
    const focused = state.index === index;
    const color = focused ? colors.green : colors.faint;
    return (
      <Pressable
        key={routeName}
        style={s.tab}
        accessibilityRole="button"
        accessibilityState={focused ? { selected: true } : {}}
        accessibilityLabel={meta.label}
        onPress={() => {
          const route = state.routes[index];
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name as never);
          } else if (focused && route.state && (route.state.index ?? 0) > 0) {
            // Re-tapping the active tab pops its stack to the root list.
            navigation.navigate(route.name as never);
          }
        }}
      >
        <Icon name={meta.icon} size={25} color={color} />
        <Text style={[s.tabLabel, { color }]}>{meta.label}</Text>
      </Pressable>
    );
  };

  return (
    <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {renderTab('HomeTab', 0)}
      {renderTab('UnitsTab', 1)}
      <View style={s.tab}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Record a payment"
          onPress={() => openSheet({ kind: 'collect' })}
          style={({ pressed }) => [s.fabWrap, pressed && { transform: [{ scale: 0.96 }] }]}
        >
          <LinearGradient colors={colors.gradLogo} start={{ x: 0, y: 0 }} end={{ x: 0.8, y: 1 }} style={s.fab}>
            <Icon name="add" size={28} color="#fff" />
          </LinearGradient>
        </Pressable>
      </View>
      {renderTab('TenantsTab', 2)}
      {renderTab('MoreTab', 3)}
    </View>
  );
}

export function AppNavigator() {
  return (
    <NavigationContainer>
      <Tabs.Navigator
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.bg } }}
        tabBar={(props) => <TabBar {...props} />}
      >
        <Tabs.Screen name="HomeTab" component={HomeScreen} />
        <Tabs.Screen name="UnitsTab" component={UnitsStackNav} />
        <Tabs.Screen name="TenantsTab" component={TenantsScreen} />
        <Tabs.Screen name="MoreTab" component={MoreStackNav} />
      </Tabs.Navigator>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.track,
    paddingTop: 11,
    paddingHorizontal: 6,
    shadowColor: '#142820',
    shadowOpacity: 0.05,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: -6 },
    elevation: 12,
  },
  tab: { flex: 1, alignItems: 'center', gap: 3, minHeight: 48 },
  tabLabel: { fontSize: 10.5, fontFamily: font.bodyBold },
  fabWrap: { marginTop: -28 },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.green,
    shadowOpacity: 0.5,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10,
  },
});
