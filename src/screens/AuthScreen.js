import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { supabase } from '../lib/supabase';
import { C } from '../theme';

export default function AuthScreen() {
  const [mode, setMode]       = useState('login'); // login | register | recovery
  const [email, setEmail]     = useState('');
  const [password, setPassword] = useState('');
  const [name, setName]       = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!email.trim()) return Alert.alert('Falta email');
    setLoading(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;

      } else if (mode === 'register') {
        if (!name.trim()) throw new Error('Escribe tu nombre');
        if (password.length < 6) throw new Error('Mínimo 6 caracteres');
        const { data, error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        if (data.user) {
          await supabase.from('profiles').upsert({ id: data.user.id, name });
        }

      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email);
        if (error) throw error;
        Alert.alert('✓ Enviado', 'Revisa tu correo para restablecer tu contraseña');
        setMode('login');
      }
    } catch (e) {
      Alert.alert('Error', e.message);
    }
    setLoading(false);
  };

  return (
    <SafeAreaView style={s.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">

          {/* Logo */}
          <View style={s.logoRow}>
            <Text style={s.logo}>RUTAFLOW</Text>
            <Text style={s.logoSub}>Rentabilidad para conductores</Text>
          </View>

          {/* Card */}
          <View style={s.card}>
            <Text style={s.cardTitle}>
              {mode === 'login' ? 'Iniciar sesión' : mode === 'register' ? 'Crear cuenta' : 'Recuperar contraseña'}
            </Text>

            {mode === 'register' && (
              <Field label="TU NOMBRE" value={name} onChange={setName} placeholder="Ej. Kike" />
            )}
            <Field label="CORREO" value={email} onChange={setEmail} placeholder="correo@ejemplo.com" keyboard="email-address" />
            {mode !== 'recovery' && (
              <Field label="CONTRASEÑA" value={password} onChange={setPassword} placeholder="••••••••" secure />
            )}

            <TouchableOpacity style={s.btn} onPress={submit} disabled={loading} activeOpacity={0.8}>
              {loading
                ? <ActivityIndicator color="#000" />
                : <Text style={s.btnText}>{mode === 'login' ? 'ENTRAR' : mode === 'register' ? 'CREAR CUENTA' : 'ENVIAR LINK'}</Text>
              }
            </TouchableOpacity>

            {/* Links */}
            <View style={s.links}>
              {mode !== 'login' && (
                <TouchableOpacity onPress={() => setMode('login')}>
                  <Text style={s.link}>← Ya tengo cuenta</Text>
                </TouchableOpacity>
              )}
              {mode === 'login' && (
                <>
                  <TouchableOpacity onPress={() => setMode('register')}>
                    <Text style={s.link}>Crear cuenta nueva</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setMode('recovery')}>
                    <Text style={[s.link, { color: C.dim }]}>¿Olvidaste tu contraseña?</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const Field = ({ label, value, onChange, placeholder, secure, keyboard }) => (
  <View style={{ marginBottom: 14 }}>
    <Text style={s.label}>{label}</Text>
    <TextInput
      style={s.input}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      placeholderTextColor={C.dim}
      secureTextEntry={secure}
      keyboardType={keyboard || 'default'}
      autoCapitalize="none"
      autoCorrect={false}
    />
  </View>
);

const s = StyleSheet.create({
  safe:     { flex: 1, backgroundColor: C.bg },
  scroll:   { flexGrow: 1, justifyContent: 'center', padding: 24 },
  logoRow:  { alignItems: 'center', marginBottom: 40 },
  logo:     { fontSize: 32, fontWeight: '900', color: C.accent, letterSpacing: 3 },
  logoSub:  { fontSize: 12, color: C.dim, letterSpacing: 1.5, marginTop: 4 },
  card:     { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 22 },
  cardTitle:{ fontSize: 16, fontWeight: '700', color: C.text, marginBottom: 22 },
  label:    { fontSize: 10, fontWeight: '700', letterSpacing: 1.2, color: C.dim, marginBottom: 6 },
  input:    {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, padding: 13, color: C.text, fontSize: 14,
  },
  btn: {
    backgroundColor: C.accent, borderRadius: 10, padding: 15,
    alignItems: 'center', marginTop: 8,
  },
  btnText:  { fontSize: 13, fontWeight: '800', color: '#000', letterSpacing: 1 },
  links:    { marginTop: 18, gap: 10, alignItems: 'center' },
  link:     { fontSize: 13, color: C.accent, fontWeight: '600' },
});
