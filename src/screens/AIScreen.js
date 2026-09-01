import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  FlatList, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { buildCtx } from '../lib/calc';
import { getPaymentUrl, isProProfile } from '../lib/billing';
import { C } from '../theme';

const SUGGESTIONS = [
  '¿Qué debo tomar para el bono?',
  '¿Qué plataforma me conviene?',
  'Dame un diagnóstico rápido',
  '¿Qué viajes debo evitar?',
  '¿Cuánto gané esta semana?',
  '¿Este bono sí conviene?',
];

const SYSTEM = (ctx) =>
  `Eres el copiloto de rentabilidad de RutaFlow para conductores de plataforma en México.
Objetivo: ayudar a ganar bonos sin sacrificar rentabilidad.
Usa todos los datos disponibles: viajes, km, minutos, gas, neto, meta por hora, plataformas, horarios, bonos activos, progreso, vencimientos y ritmo requerido.
Responde breve: maximo 5 bullets, sin introducciones largas.
Cada respuesta debe incluir una decision concreta: tomar, esperar, evitar, perseguir bono o abandonar bono.
Cuando haya bono activo, calcula mentalmente si el ritmo restante y el neto por hora justifican seguirlo.
Si faltan datos, dilo en una sola linea y da la mejor regla practica con los datos actuales.
Español mexicano informal, claro y directo.
${ctx}`;

export default function AIScreen({ trips = [], bonuses = [], cfg = {}, profile }) {
  const [msgs, setMsgs]     = useState([{
    role: 'assistant',
    content: 'Soy tu asesor de rentabilidad. Te digo que tomar, que evitar y cuando un bono deja de convenir.',
  }]);
  const [input, setInput]   = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef(null);
  const isPro = isProProfile(profile);

  useEffect(() => {
    if (msgs.length > 0) setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
  }, [msgs, loading]);

  const send = async (text) => {
    if (!isPro) {
      const url = getPaymentUrl();
      Alert.alert('RutaFlow Pro', 'El asesor IA es parte de RutaFlow Pro.', [
        { text: 'Después', style: 'cancel' },
        ...(url ? [{ text: 'Ver Pro', onPress: () => Linking.openURL(url) }] : []),
      ]);
      return;
    }
    const content = (text || input).trim();
    if (!content || loading) return;
    const um = { role: 'user', content };
    setMsgs(p => [...p, um]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          max_tokens: 700,
          messages: [
            { role: 'system', content: SYSTEM(buildCtx(trips, cfg, bonuses)) },
            ...[...msgs, um].map(m => ({ role: m.role, content: m.content })),
          ],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      setMsgs(p => [...p, { role: 'assistant', content: data.choices?.[0]?.message?.content || 'Error.' }]);
    } catch (e) {
      setMsgs(p => [...p, { role: 'assistant', content: `Error: ${e.message}` }]);
    }
    setLoading(false);
  };

  const renderMsg = ({ item }) => (
    <View style={[s.bubble, item.role === 'user' ? s.userBubble : s.aiBubble]}>
      <Text style={[s.bubbleText, item.role === 'user' && { color: C.text }]}>{item.content}</Text>
    </View>
  );

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>

        {/* Header */}
        <View style={s.header}>
          <Text style={s.headerTitle}>IA ASESOR</Text>
          <Text style={s.headerSub}>{isPro ? `Análisis basado en tus ${trips.length} viajes y ${bonuses.length} bonos` : 'Disponible en RutaFlow Pro'}</Text>
        </View>

        {/* Suggestions */}
        {msgs.length <= 1 && (
          <View style={s.suggestions}>
            {SUGGESTIONS.map(sug => (
              <TouchableOpacity key={sug} style={s.suggestion} onPress={() => send(sug)} activeOpacity={0.7}>
                <Text style={s.suggestionText}>{sug}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Messages */}
        <FlatList
          ref={listRef}
          data={msgs}
          renderItem={renderMsg}
          keyExtractor={(_, i) => String(i)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListFooterComponent={loading ? (
            <View style={s.aiBubble}>
              <ActivityIndicator color={C.teal} size="small" />
            </View>
          ) : null}
        />

        {/* Input */}
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Pregunta sobre bonos, viajes o rentabilidad..."
            placeholderTextColor={C.dim}
            onSubmitEditing={() => send()}
            returnKeyType="send"
            multiline
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || loading) && s.sendBtnDisabled]}
            onPress={() => send()}
            disabled={!input.trim() || loading}
          >
            <Text style={s.sendIcon}>↑</Text>
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: C.bg },
  header:     { paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:{ fontSize: 13, fontWeight: '800', color: C.accent, letterSpacing: 1.5 },
  headerSub:  { fontSize: 11, color: C.dim, marginTop: 2 },

  suggestions:{ padding: 12, flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  suggestion: {
    backgroundColor: `${C.teal}15`, borderWidth: 1, borderColor: `${C.teal}40`,
    borderRadius: 18, paddingVertical: 7, paddingHorizontal: 12,
  },
  suggestionText: { fontSize: 11, color: C.teal, fontWeight: '600' },

  list:       { padding: 14, gap: 10, paddingBottom: 10 },
  bubble:     { maxWidth: '88%', padding: 13, borderRadius: 14 },
  userBubble: {
    alignSelf: 'flex-end', backgroundColor: `${C.accent}20`,
    borderWidth: 1, borderColor: `${C.accent}50`,
    borderTopLeftRadius: 14, borderTopRightRadius: 14,
    borderBottomLeftRadius: 14, borderBottomRightRadius: 3,
  },
  aiBubble:   {
    alignSelf: 'flex-start', backgroundColor: C.card,
    borderWidth: 1, borderColor: C.border,
  },
  bubbleText: { fontSize: 14, color: C.text, lineHeight: 22 },

  inputRow:   {
    flexDirection: 'row', gap: 8, padding: 12,
    borderTopWidth: 1, borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  input:      {
    flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    color: C.text, fontSize: 14, maxHeight: 100,
  },
  sendBtn:    {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: C.card, borderWidth: 1, borderColor: C.border },
  sendIcon:   { fontSize: 18, fontWeight: '800', color: '#000' },
});
