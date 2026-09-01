import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { supabase } from './src/lib/supabase';
import { C } from './src/theme';
import AuthScreen from './src/screens/AuthScreen';
import HomeScreen from './src/screens/HomeScreen';
import AIScreen   from './src/screens/AIScreen';

const Tab = createBottomTabNavigator();

const DEFAULT_CFG = {
  gasPricePerLiter: 24, kmPerLiter: 12, targetHourlyRate: 200,
  monthlyRent: 0, insurance: 0, tires: 0, maintenance: 0,
};

// ─── TAB ICON ─────────────────────────────────────────────────────────────────
const TabIcon = ({ label, icon, focused }) => (
  <View style={{ alignItems: 'center', paddingTop: 4 }}>
    <Text style={{ fontSize: 20 }}>{icon}</Text>
    <Text style={{ fontSize: 9, fontWeight: '700', letterSpacing: 0.8, marginTop: 2, color: focused ? C.accent : C.dim }}>
      {label}
    </Text>
  </View>
);

export default function App() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [trips,   setTrips]   = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [cfg,     setCfg]     = useState(DEFAULT_CFG);
  const [profile, setProfile] = useState(null);

  // ─── Auth listener ──────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ─── Load data when session changes ─────────────────────────────────────────
  useEffect(() => {
    if (session?.user) {
      loadData();
    } else {
      setTrips([]); setBonuses([]); setProfile(null); setCfg(DEFAULT_CFG);
    }
  }, [session]);

  const loadData = useCallback(async () => {
    const uid = session?.user?.id;
    if (!uid) return;

    // Load trips
    const { data: tripsData } = await supabase
      .from('trips')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(500);
    if (tripsData) setTrips(tripsData);

    // Load bonus records and active bonus goals
    const { data: bonusesData } = await supabase
      .from('bonuses')
      .select('*')
      .eq('user_id', uid)
      .order('created_at', { ascending: false })
      .limit(500);
    if (bonusesData) setBonuses(bonusesData);

    // Load profile + config
    const { data: profileData } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', uid)
      .single();
    if (profileData) {
      setProfile(profileData);
      if (profileData.config) setCfg({ ...DEFAULT_CFG, ...profileData.config });
    }
  }, [session]);

  // ─── Save trip ───────────────────────────────────────────────────────────────
  const saveTrip = useCallback(async (tripData) => {
    const uid = session?.user?.id;
    if (!uid) throw new Error('No hay sesión');

    const { data, error } = await supabase.from('trips').insert({
      user_id:    uid,
      ...tripData,
      created_at: new Date().toISOString(),
    }).select().single();

    if (error) throw error;
    if (data) setTrips(p => [data, ...p]);
    return data;
  }, [session]);

  // ─── Save bonus ─────────────────────────────────────────────────────────────
  const saveBonus = useCallback(async (bonusData) => {
    const uid = session?.user?.id;
    if (!uid) throw new Error('No hay sesión');

    const { data, error } = await supabase.from('bonuses').insert({
      user_id:    uid,
      ...bonusData,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select().single();

    if (error) throw error;
    if (data) setBonuses(p => [data, ...p]);
    return data;
  }, [session]);

  const updateBonus = useCallback(async (bonusId, bonusData) => {
    const uid = session?.user?.id;
    if (!uid) throw new Error('No hay sesión');

    const { data, error } = await supabase
      .from('bonuses')
      .update({ ...bonusData, updated_at: new Date().toISOString() })
      .eq('id', bonusId)
      .eq('user_id', uid)
      .select()
      .single();

    if (error) throw error;
    if (data) setBonuses(p => p.map(b => b.id === bonusId ? data : b));
    return data;
  }, [session]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.accent, fontSize: 24, fontWeight: '900', letterSpacing: 3 }}>RUTAFLOW</Text>
      </View>
    );
  }

  if (!session) {
    return (
      <SafeAreaProvider>
        <AuthScreen />
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <Tab.Navigator
            screenOptions={{
              headerShown: false,
              tabBarStyle: {
                backgroundColor: C.card,
                borderTopColor: C.border,
                borderTopWidth: 1,
                height: 70,
                paddingBottom: 10,
              },
              tabBarShowLabel: false,
            }}
          >
            <Tab.Screen
              name="Hoy"
              options={{ tabBarIcon: ({ focused }) => <TabIcon label="HOY" icon="🏠" focused={focused} /> }}
            >
              {() => (
                <HomeScreen
                  cfg={cfg}
                  trips={trips}
                  bonuses={bonuses}
                  onSaveTrip={saveTrip}
                  onSaveBonus={saveBonus}
                  onUpdateBonus={updateBonus}
                  profile={profile}
                />
              )}
            </Tab.Screen>

            <Tab.Screen
              name="IA"
              options={{ tabBarIcon: ({ focused }) => <TabIcon label="IA" icon="🤖" focused={focused} /> }}
            >
              {() => <AIScreen trips={trips} bonuses={bonuses} cfg={cfg} profile={profile} />}
            </Tab.Screen>
          </Tab.Navigator>
        </NavigationContainer>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
