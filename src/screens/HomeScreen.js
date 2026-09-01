import React, { useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Alert, ActivityIndicator, Modal, TextInput, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { useGPS } from '../hooks/useGPS';
import {
  calcBonus,
  calcTrip,
  evaluateTripForBonus,
  fmtMXN,
  fmt,
  isSameLocalDay,
  localDateKey,
  localTimeLabel,
  parseLocalDeadline,
} from '../lib/calc';
import { canAddTrip, FREE_MONTHLY_TRIP_LIMIT, getPaymentUrl, isProProfile } from '../lib/billing';
import { C, S } from '../theme';

const PLATFORMS = ['uber', 'didi', 'indrive', 'rappi', 'otra'];
const BONUS_TYPES = ['racha', 'desafio', 'garantia', 'referido', 'promocion', 'ajuste'];

const DEFAULT_CFG = {
  gasPricePerLiter: 24, kmPerLiter: 12, targetHourlyRate: 200,
  monthlyRent: 0, insurance: 0, tires: 0, maintenance: 0,
};

export default function HomeScreen({
  cfg = DEFAULT_CFG,
  trips = [],
  bonuses = [],
  onSaveTrip,
  onSaveBonus,
  onUpdateBonus,
  profile,
}) {
  const gps = useGPS();

  const [showModal, setShowModal]     = useState(false);
  const [showBonusModal, setShowBonusModal] = useState(false);
  const [platform, setPlatform]       = useState('uber');
  const [fare, setFare]               = useState('');
  const [pickupKm, setPickupKm]       = useState('');
  const [pickupMin, setPickupMin]     = useState('');
  const [destKm, setDestKm]           = useState('');
  const [destMin, setDestMin]         = useState('');
  const [mode, setMode]               = useState('manual'); // manual | gps | photo
  const [analyzing, setAnalyzing]     = useState(false);
  const [saving, setSaving]           = useState(false);
  const [bonusMode, setBonusMode] = useState('received'); // received | active
  const [bonusPlatform, setBonusPlatform] = useState('uber');
  const [bonusType, setBonusType] = useState('racha');
  const [bonusAmount, setBonusAmount] = useState('');
  const [bonusRequiredTrips, setBonusRequiredTrips] = useState('');
  const [bonusCompletedTrips, setBonusCompletedTrips] = useState('');
  const [bonusExtraKm, setBonusExtraKm] = useState('');
  const [bonusExtraMin, setBonusExtraMin] = useState('');
  const [bonusStartsDate, setBonusStartsDate] = useState(localDateKey(new Date()));
  const [bonusStartsTime, setBonusStartsTime] = useState('00:00');
  const [bonusExpiresDate, setBonusExpiresDate] = useState(localDateKey(new Date()));
  const [bonusExpiresTime, setBonusExpiresTime] = useState('23:59');
  const [bonusNotes, setBonusNotes] = useState('');
  const isPro = isProProfile(profile);

  // Today's trips
  const todayTrips = trips.filter(t => isSameLocalDay(t.created_at || t.end_time));
  const todayBonuses = bonuses.filter(b => {
    const d = b.paid_at || b.created_at || 0;
    return isSameLocalDay(d) && ['paid', 'earned'].includes(b.status);
  });
  const currentMonthKey = localDateKey(new Date()).slice(0, 7);
  const monthlyTripsCount = trips.filter(t => localDateKey(t.created_at || t.end_time).slice(0, 7) === currentMonthKey).length;
  const todayTots  = todayTrips.reduce((a, t) => {
    const c = calcTrip(t, cfg);
    return { net: a.net + c.net, km: a.km + c.km, n: a.n + 1 };
  }, { net: 0, km: 0, n: 0 });
  const todayBonusNet = todayBonuses.reduce((a, b) => a + calcBonus(b, cfg).net, 0);
  const todayNet = todayTots.net + todayBonusNet;
  const activeBonuses = bonuses.filter(b => b.status === 'active').slice(0, 3);

  // ─── GPS Trip ───────────────────────────────────────────────────────────────
  const handleGPSToggle = async () => {
    if (!isPro) {
      showUpgrade('El GPS automático es parte de RutaFlow Pro.');
      return;
    }
    if (!gps.isTracking) {
      const ok = await gps.startTracking();
      if (!ok) {
        Alert.alert('Permiso requerido', 'RutaFlow necesita acceso a tu ubicación en segundo plano para registrar la ruta.');
      }
    } else {
      const result = await gps.stopTracking();
      setFare('');
      setPickupKm('0');
      setPickupMin('0');
      setDestKm(fmt(result.km, 1));
      setDestMin(fmt(result.min, 0));
      setMode('gps');
      setShowModal(true);
    }
  };

  // ─── Photo AI ───────────────────────────────────────────────────────────────
  const handlePhoto = async () => {
    if (!isPro) {
      showUpgrade('La captura con IA es parte de RutaFlow Pro.');
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert('Permiso requerido', 'Necesitamos acceso a tus fotos.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true, quality: 0.7,
    });
    if (result.canceled) return;

    setAnalyzing(true);
    try {
      const b64 = `data:image/jpeg;base64,${result.assets[0].base64}`;
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.EXPO_PUBLIC_GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          temperature: 0.1,
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'Eres un extractor de datos de capturas de Uber/Didi. Extrae: tarifa cobrada, km y minutos de RECOLECCIÓN, km y minutos al DESTINO. Responde SOLO este JSON sin texto extra: {"fare":0,"pickup_km":0,"pickup_min":0,"dest_km":0,"dest_min":0}' },
              { type: 'image_url', image_url: { url: b64 } },
            ],
          }],
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message);
      const raw   = data.choices?.[0]?.message?.content || '{}';
      const match = raw.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : '{}');
      if (!parsed.fare && !parsed.dest_km) throw new Error('No se detectaron datos en la imagen');
      setFare(String(parsed.fare || ''));
      setPickupKm(String(parsed.pickup_km || ''));
      setPickupMin(String(parsed.pickup_min || ''));
      setDestKm(String(parsed.dest_km || ''));
      setDestMin(String(parsed.dest_min || ''));
      setMode('photo');
      setShowModal(true);
    } catch (err) {
      Alert.alert('Error', err.message);
    }
    setAnalyzing(false);
  };

  // ─── Save trip ──────────────────────────────────────────────────────────────
  const saveTrip = async () => {
    if (!fare) { Alert.alert('Falta la tarifa'); return; }
    if (!canAddTrip(profile, monthlyTripsCount)) {
      showUpgrade(`Tu plan gratis incluye ${FREE_MONTHLY_TRIP_LIMIT} viajes al mes.`);
      return;
    }
    setSaving(true);
    try {
      const loc = gps.currentCoord;
      await onSaveTrip({
        platform,
        fare: parseFloat(fare) || 0,
        pickup_km:  parseFloat(pickupKm)  || 0,
        pickup_min: parseFloat(pickupMin) || 0,
        dest_km:    parseFloat(destKm)    || 0,
        dest_min:   parseFloat(destMin)   || 0,
        gps_km:     mode === 'gps' ? parseFloat(destKm) || 0 : null,
        gps_min:    mode === 'gps' ? parseFloat(destMin) || 0 : null,
        lat:        loc?.lat  || null,
        lng:        loc?.lng  || null,
        mode,
      });
      setShowModal(false);
      resetForm();
    } catch (e) {
      Alert.alert('Error al guardar', e.message);
    }
    setSaving(false);
  };

  const resetForm = () => {
    setFare(''); setPickupKm(''); setPickupMin('');
    setDestKm(''); setDestMin(''); setMode('manual');
  };

  const resetBonusForm = () => {
    setBonusMode('received');
    setBonusPlatform('uber');
    setBonusType('racha');
    setBonusAmount('');
    setBonusRequiredTrips('');
    setBonusCompletedTrips('');
    setBonusExtraKm('');
    setBonusExtraMin('');
    setBonusStartsDate(localDateKey(new Date()));
    setBonusStartsTime('00:00');
    setBonusExpiresDate(localDateKey(new Date()));
    setBonusExpiresTime('23:59');
    setBonusNotes('');
  };

  const saveBonus = async () => {
    if (!bonusAmount) { Alert.alert('Falta el monto del bono'); return; }
    const startsAt = bonusMode === 'active' ? parseLocalDeadline(bonusStartsDate, bonusStartsTime) : null;
    const expiresAt = bonusMode === 'active' ? parseLocalDeadline(bonusExpiresDate, bonusExpiresTime) : null;
    if (bonusMode === 'active' && (!startsAt || !expiresAt)) {
      Alert.alert('Revisa la temporalidad', 'Usa formato YYYY-MM-DD para fecha y HH:mm para hora.');
      return;
    }
    setSaving(true);
    try {
      await onSaveBonus({
        platform: bonusPlatform,
        bonus_type: bonusType,
        amount: parseFloat(bonusAmount) || 0,
        required_trips: bonusMode === 'active' ? parseInt(bonusRequiredTrips, 10) || 0 : null,
        completed_trips: bonusMode === 'active' ? parseInt(bonusCompletedTrips, 10) || 0 : null,
        extra_km: parseFloat(bonusExtraKm) || 0,
        extra_min: parseFloat(bonusExtraMin) || 0,
        starts_at: startsAt ? startsAt.toISOString() : null,
        expires_at: expiresAt ? expiresAt.toISOString() : null,
        notes: bonusNotes.trim() || null,
        status: bonusMode === 'active' ? 'active' : 'paid',
        paid_at: bonusMode === 'active' ? null : new Date().toISOString(),
      });
      setShowBonusModal(false);
      resetBonusForm();
    } catch (e) {
      Alert.alert('Error al guardar bono', e.message);
    }
    setSaving(false);
  };

  const bumpBonusProgress = async (bonus, delta) => {
    const current = parseInt(bonus.completed_trips, 10) || 0;
    const required = parseInt(bonus.required_trips, 10) || 0;
    const next = Math.max(0, current + delta);
    const status = required > 0 && next >= required ? 'earned' : 'active';
    try {
      await onUpdateBonus(bonus.id, {
        completed_trips: next,
        status,
        paid_at: status === 'earned' ? new Date().toISOString() : bonus.paid_at,
      });
    } catch (e) {
      Alert.alert('Error al actualizar bono', e.message);
    }
  };

  const openUpgrade = async () => {
    const url = getPaymentUrl();
    if (!url) {
      Alert.alert('RutaFlow Pro', 'Configura EXPO_PUBLIC_STRIPE_PAYMENT_LINK o EXPO_PUBLIC_MERCADOPAGO_PAYMENT_LINK para activar el cobro.');
      return;
    }
    await Linking.openURL(url);
  };

  const showUpgrade = (message) => {
    Alert.alert('RutaFlow Pro', message, [
      { text: 'Después', style: 'cancel' },
      { text: 'Ver Pro', onPress: openUpgrade },
    ]);
  };

  const previewCalc = calcTrip({
    fare: parseFloat(fare) || 0,
    pickup_km: parseFloat(pickupKm) || 0, pickup_min: parseFloat(pickupMin) || 0,
    dest_km: parseFloat(destKm) || 0, dest_min: parseFloat(destMin) || 0,
  }, cfg);
  const previewTrip = {
    fare: parseFloat(fare) || 0,
    pickup_km: parseFloat(pickupKm) || 0,
    pickup_min: parseFloat(pickupMin) || 0,
    dest_km: parseFloat(destKm) || 0,
    dest_min: parseFloat(destMin) || 0,
  };
  const matchingBonusInsights = activeBonuses
    .filter(b => b.platform === platform)
    .map(b => ({ bonus: b, insight: evaluateTripForBonus(previewTrip, b, cfg) }));

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.logoText}>RUTAFLOW</Text>
            <Text style={s.userName}>{profile?.name || ''}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={s.todayLabel}>hoy neto</Text>
            <Text style={[s.todayNet, { color: todayNet >= 0 ? C.teal : C.red }]}>
              {fmtMXN(todayNet)}
            </Text>
          </View>
        </View>

        {!isPro && (
          <TouchableOpacity style={s.proBanner} onPress={openUpgrade} activeOpacity={0.85}>
            <View style={{ flex: 1 }}>
              <Text style={s.proTitle}>RutaFlow Pro</Text>
              <Text style={s.proText}>
                {monthlyTripsCount}/{FREE_MONTHLY_TRIP_LIMIT} viajes gratis este mes. Desbloquea GPS, Foto IA e historial ilimitado.
              </Text>
            </View>
            <Text style={s.proCta}>VER</Text>
          </TouchableOpacity>
        )}

        {/* GPS Button */}
        <TouchableOpacity
          style={[s.gpsBtn, gps.isTracking && s.gpsBtnActive]}
          onPress={handleGPSToggle}
          activeOpacity={0.85}
        >
          {gps.isTracking ? (
            <View style={{ alignItems: 'center' }}>
              <Text style={s.gpsBtnIcon}>⏹</Text>
              <Text style={s.gpsBtnText}>TERMINAR VIAJE GPS</Text>
              <View style={s.gpsStats}>
                <Text style={s.gpsStat}>{fmt(gps.distanceKm, 1)} km</Text>
                <Text style={[s.gpsStat, { color: C.dim }]}> · </Text>
                <Text style={s.gpsStat}>{fmt(gps.elapsedMin, 0)} min</Text>
              </View>
              <Text style={s.gpsLive}>● GPS activo en segundo plano</Text>
            </View>
          ) : (
            <View style={{ alignItems: 'center' }}>
              <Text style={s.gpsBtnIcon}>📍</Text>
              <Text style={s.gpsBtnText}>INICIAR VIAJE GPS</Text>
              <Text style={s.gpsBtnSub}>Registra km automáticamente</Text>
            </View>
          )}
        </TouchableOpacity>

        {/* Quick actions */}
        <View style={s.actions}>
          <TouchableOpacity style={s.actionBtn} onPress={() => { resetForm(); setShowModal(true); }} activeOpacity={0.8}>
            <Text style={s.actionIcon}>✏️</Text>
            <Text style={s.actionText}>MANUAL</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={handlePhoto} disabled={analyzing} activeOpacity={0.8}>
            {analyzing ? <ActivityIndicator color={C.accent} /> : <Text style={s.actionIcon}>📷</Text>}
            <Text style={s.actionText}>FOTO IA</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.actionBtn} onPress={() => { resetBonusForm(); setShowBonusModal(true); }} activeOpacity={0.8}>
            <Text style={s.actionIcon}>🎯</Text>
            <Text style={s.actionText}>BONO</Text>
          </TouchableOpacity>
        </View>

        {/* Today stats */}
        {(todayTrips.length > 0 || todayBonuses.length > 0) && (
          <View style={s.statsRow}>
            <StatBox label="VIAJES HOY" value={String(todayTots.n)} />
            <StatBox label="KM HOY" value={fmt(todayTots.km, 0)} />
            <StatBox label="BONOS HOY" value={fmtMXN(todayBonusNet)} accent />
          </View>
        )}

        {activeBonuses.length > 0 && (
          <View style={s.bonusSection}>
            <Text style={s.sectionTitle}>BONOS ACTIVOS</Text>
            {activeBonuses.map(b => (
              <BonusCard key={b.id} bonus={b} cfg={cfg} onProgress={bumpBonusProgress} />
            ))}
          </View>
        )}

        {/* Recent trips */}
        {(todayTrips.length > 0 || todayBonuses.length > 0) && (
          <View>
            <Text style={s.sectionTitle}>HOY</Text>
            {todayTrips.slice(0, 5).map(t => <TripRow key={t.id} trip={t} cfg={cfg} />)}
            {todayBonuses.slice(0, 3).map(b => <BonusRow key={b.id} bonus={b} cfg={cfg} />)}
          </View>
        )}

      </ScrollView>

      {/* New Trip Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>NUEVO VIAJE</Text>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={{ color: C.dim, fontSize: 22 }}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Platform */}
            <Text style={S.label}>PLATAFORMA</Text>
            <View style={s.platformRow}>
              {PLATFORMS.map(p => (
                <TouchableOpacity
                  key={p} style={[s.platBtn, platform === p && s.platBtnActive]}
                  onPress={() => setPlatform(p)}
                >
                  <Text style={[s.platText, platform === p && { color: C.accent }]}>
                    {p.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Fare */}
            <Text style={[S.label, { marginTop: 16 }]}>TARIFA (MXN)</Text>
            <TextInput
              style={s.input} value={fare} onChangeText={setFare}
              keyboardType="decimal-pad" placeholder="0.00"
              placeholderTextColor={C.dim}
            />

            {/* Pickup */}
            <Text style={[S.label, { marginTop: 16 }]}>RECOLECCIÓN</Text>
            <View style={s.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={s.sublabel}>km</Text>
                <TextInput style={s.input} value={pickupKm} onChangeText={setPickupKm} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.dim} />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.sublabel}>min</Text>
                <TextInput style={s.input} value={pickupMin} onChangeText={setPickupMin} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.dim} />
              </View>
            </View>

            {/* Destination */}
            <Text style={[S.label, { marginTop: 16 }]}>DESTINO</Text>
            <View style={s.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={s.sublabel}>km</Text>
                <TextInput style={s.input} value={destKm} onChangeText={setDestKm} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.dim} />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.sublabel}>min</Text>
                <TextInput style={s.input} value={destMin} onChangeText={setDestMin} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.dim} />
              </View>
            </View>

            {/* Preview */}
            {!!fare && (
              <View style={s.preview}>
                <PreviewRow label="Tarifa" value={fmtMXN(previewCalc.fare)} />
                <PreviewRow label="Gas estimado" value={`-${fmtMXN(previewCalc.gas)}`} color={C.red} />
                <View style={s.divider} />
                <PreviewRow label="NETO" value={fmtMXN(previewCalc.net)} color={previewCalc.net >= 0 ? C.teal : C.red} bold />
              </View>
            )}

            {!!fare && matchingBonusInsights.length > 0 && (
              <View style={s.bonusAdviceStack}>
                {matchingBonusInsights.map(({ bonus, insight }) => (
                  <BonusTripAdvice key={bonus.id} bonus={bonus} insight={insight} />
                ))}
              </View>
            )}

            {/* Save */}
            <TouchableOpacity style={[s.saveBtn, !fare && s.saveBtnDisabled]} onPress={saveTrip} disabled={!fare || saving}>
              {saving ? <ActivityIndicator color="#000" /> : <Text style={s.saveBtnText}>GUARDAR VIAJE</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* New Bonus Modal */}
      <Modal visible={showBonusModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowBonusModal(false)}>
        <View style={s.modal}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>BONO</Text>
            <TouchableOpacity onPress={() => setShowBonusModal(false)}>
              <Text style={{ color: C.dim, fontSize: 22 }}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={s.segmentRow}>
              <TouchableOpacity style={[s.segmentBtn, bonusMode === 'received' && s.segmentBtnActive]} onPress={() => setBonusMode('received')}>
                <Text style={[s.segmentText, bonusMode === 'received' && s.segmentTextActive]}>RECIBIDO</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.segmentBtn, bonusMode === 'active' && s.segmentBtnActive]} onPress={() => setBonusMode('active')}>
                <Text style={[s.segmentText, bonusMode === 'active' && s.segmentTextActive]}>ACTIVO</Text>
              </TouchableOpacity>
            </View>

            <Text style={S.label}>PLATAFORMA</Text>
            <View style={s.platformWrap}>
              {PLATFORMS.map(p => (
                <TouchableOpacity key={p} style={[s.platBtn, bonusPlatform === p && s.platBtnActive]} onPress={() => setBonusPlatform(p)}>
                  <Text style={[s.platText, bonusPlatform === p && { color: C.accent }]}>{p.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[S.label, { marginTop: 16 }]}>TIPO</Text>
            <View style={s.platformWrap}>
              {BONUS_TYPES.map(t => (
                <TouchableOpacity key={t} style={[s.platBtn, bonusType === t && s.platBtnActive]} onPress={() => setBonusType(t)}>
                  <Text style={[s.platText, bonusType === t && { color: C.accent }]}>{t.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[S.label, { marginTop: 16 }]}>MONTO DEL BONO (MXN)</Text>
            <TextInput style={s.input} value={bonusAmount} onChangeText={setBonusAmount} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.dim} />

            {bonusMode === 'active' && (
              <>
                <Text style={[S.label, { marginTop: 16 }]}>PROGRESO</Text>
                <View style={s.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sublabel}>viajes hechos</Text>
                    <TextInput style={s.input} value={bonusCompletedTrips} onChangeText={setBonusCompletedTrips} keyboardType="number-pad" placeholder="0" placeholderTextColor={C.dim} />
                  </View>
                  <View style={{ width: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.sublabel}>viajes meta</Text>
                    <TextInput style={s.input} value={bonusRequiredTrips} onChangeText={setBonusRequiredTrips} keyboardType="number-pad" placeholder="10" placeholderTextColor={C.dim} />
                  </View>
                </View>

                <Text style={[S.label, { marginTop: 16 }]}>TEMPORALIDAD LOCAL</Text>
                <View style={s.twoCol}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sublabel}>inicia fecha</Text>
                    <TextInput style={s.input} value={bonusStartsDate} onChangeText={setBonusStartsDate} placeholder="YYYY-MM-DD" placeholderTextColor={C.dim} />
                  </View>
                  <View style={{ width: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.sublabel}>inicia hora</Text>
                    <TextInput style={s.input} value={bonusStartsTime} onChangeText={setBonusStartsTime} placeholder="00:00" placeholderTextColor={C.dim} />
                  </View>
                </View>
                <View style={[s.twoCol, { marginTop: 10 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sublabel}>vence fecha</Text>
                    <TextInput style={s.input} value={bonusExpiresDate} onChangeText={setBonusExpiresDate} placeholder="YYYY-MM-DD" placeholderTextColor={C.dim} />
                  </View>
                  <View style={{ width: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.sublabel}>vence hora</Text>
                    <TextInput style={s.input} value={bonusExpiresTime} onChangeText={setBonusExpiresTime} placeholder="23:59" placeholderTextColor={C.dim} />
                  </View>
                </View>
              </>
            )}

            <Text style={[S.label, { marginTop: 16 }]}>COSTO EXTRA ESTIMADO</Text>
            <View style={s.twoCol}>
              <View style={{ flex: 1 }}>
                <Text style={s.sublabel}>km extra</Text>
                <TextInput style={s.input} value={bonusExtraKm} onChangeText={setBonusExtraKm} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.dim} />
              </View>
              <View style={{ width: 10 }} />
              <View style={{ flex: 1 }}>
                <Text style={s.sublabel}>min extra</Text>
                <TextInput style={s.input} value={bonusExtraMin} onChangeText={setBonusExtraMin} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={C.dim} />
              </View>
            </View>

            <Text style={[S.label, { marginTop: 16 }]}>NOTAS</Text>
            <TextInput
              style={[s.input, s.notesInput]}
              value={bonusNotes}
              onChangeText={setBonusNotes}
              placeholder="Ej. 12 viajes antes de las 10 PM"
              placeholderTextColor={C.dim}
              multiline
            />

            {!!bonusAmount && (
              <BonusPreview
                bonus={{
                  amount: bonusAmount,
                  extra_km: bonusExtraKm,
                  extra_min: bonusExtraMin,
                  required_trips: bonusRequiredTrips,
                  completed_trips: bonusCompletedTrips,
                }}
                cfg={cfg}
              />
            )}

            <TouchableOpacity style={[s.saveBtn, !bonusAmount && s.saveBtnDisabled]} onPress={saveBonus} disabled={!bonusAmount || saving}>
              {saving ? <ActivityIndicator color="#000" /> : <Text style={s.saveBtnText}>{bonusMode === 'active' ? 'GUARDAR BONO ACTIVO' : 'REGISTRAR BONO'}</Text>}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const StatBox = ({ label, value, accent }) => (
  <View style={s.statBox}>
    <Text style={s.statLabel}>{label}</Text>
    <Text style={[s.statValue, accent && { color: C.teal }]}>{value}</Text>
  </View>
);

const TripRow = ({ trip, cfg }) => {
  const c = calcTrip(trip, cfg);
  const d = new Date(trip.created_at || trip.end_time || 0);
  return (
    <View style={s.tripRow}>
      <View style={s.tripLeft}>
        <Text style={s.tripPlat}>{(trip.platform || 'uber').toUpperCase()}</Text>
        <Text style={s.tripTime}>{d.getHours()}:{String(d.getMinutes()).padStart(2,'0')}</Text>
      </View>
      <View style={{ flex: 1 }} />
      <Text style={s.tripFare}>{fmtMXN(trip.fare)}</Text>
      <Text style={[s.tripNet, { color: c.net >= 0 ? C.teal : C.red }]}>{fmtMXN(c.net)}</Text>
    </View>
  );
};

const BonusRow = ({ bonus, cfg }) => {
  const c = calcBonus(bonus, cfg);
  const d = new Date(bonus.paid_at || bonus.created_at || 0);
  return (
    <View style={s.tripRow}>
      <View style={s.tripLeft}>
        <Text style={s.tripPlat}>{(bonus.platform || 'uber').toUpperCase()}</Text>
        <Text style={s.tripTime}>{d.getHours()}:{String(d.getMinutes()).padStart(2,'0')}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={s.bonusRowTitle}>BONO {String(bonus.bonus_type || '').toUpperCase()}</Text>
      </View>
      <Text style={s.tripFare}>{fmtMXN(c.amount)}</Text>
      <Text style={[s.tripNet, { color: c.net >= 0 ? C.teal : C.red }]}>{fmtMXN(c.net)}</Text>
    </View>
  );
};

const BonusCard = ({ bonus, cfg, onProgress }) => {
  const c = calcBonus(bonus, cfg);
  const required = parseInt(bonus.required_trips, 10) || 0;
  const completed = parseInt(bonus.completed_trips, 10) || 0;
  const pct = Math.round(c.progress * 100);
  const isWorthIt = c.valueAfterTime >= 0;
  return (
    <View style={s.bonusCard}>
      <View style={s.bonusHeader}>
        <View>
          <Text style={s.bonusTitle}>{(bonus.platform || 'uber').toUpperCase()} · {String(bonus.bonus_type || 'bono').toUpperCase()}</Text>
          <Text style={s.bonusMeta}>{completed}/{required || '-'} viajes · {pct}%</Text>
        </View>
        <Text style={s.bonusAmount}>{fmtMXN(c.amount)}</Text>
      </View>
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${pct}%` }]} />
      </View>
      <View style={s.bonusFooter}>
        <Text style={[s.bonusVerdict, { color: isWorthIt ? C.teal : C.red }]}>
          {isWorthIt ? 'CONVIENE' : 'APENAS'}
        </Text>
        <Text style={s.bonusNet}>real {fmtMXN(c.net)}</Text>
        {!!bonus.expires_at && <Text style={s.bonusNet}>vence {localTimeLabel(bonus.expires_at)}</Text>}
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={s.progressBtn} onPress={() => onProgress(bonus, -1)}>
          <Text style={s.progressBtnText}>-</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.progressBtn} onPress={() => onProgress(bonus, 1)}>
          <Text style={s.progressBtnText}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const BonusTripAdvice = ({ bonus, insight }) => {
  const color = insight.verdict === 'take' ? C.teal : insight.verdict === 'maybe' ? C.accent : C.red;
  const title = {
    take: 'TOMAR AYUDA AL BONO',
    maybe: 'SOLO SI NO HAY MEJOR',
    skip: 'MEJOR ESPERAR OTRO',
    done: 'BONO COMPLETO',
    neutral: 'REVISA EL BONO',
  }[insight.verdict];
  const remainingText = insight.remainingAfterTrip === 0
    ? 'Con este completas la meta.'
    : `Despues de este faltarian ${insight.remainingAfterTrip} viajes.`;
  const paceText = insight.avgMinNeeded
    ? `Necesitas promediar ${fmt(insight.avgMinNeeded, 0)} min por viaje restante.`
    : 'Sin hora limite clara, cuida que cada viaje sea rentable.';
  const tripShape = insight.avgMinNeeded && insight.avgMinNeeded < 22
    ? `Prioriza viajes cortos de ${fmt(Math.max(insight.avgMinNeeded - 4, 8), 0)}-${fmt(insight.avgMinNeeded + 4, 0)} min.`
    : 'Puedes aceptar viajes medianos si superan tu meta por hora.';

  return (
    <View style={[s.bonusAdvice, { borderColor: `${color}88` }]}>
      <View style={s.bonusAdviceHeader}>
        <Text style={[s.bonusAdviceTitle, { color }]}>{title}</Text>
        <Text style={s.bonusAdviceAmount}>+{fmtMXN(insight.bonusShare)}</Text>
      </View>
      <Text style={s.bonusAdviceText}>
        {remainingText} {paceText}
      </Text>
      <Text style={s.bonusAdviceText}>
        Neto con parte del bono: {fmtMXN(insight.effectiveNet)} · {fmtMXN(insight.effectiveHourly)}/hr.
      </Text>
      <Text style={s.bonusAdviceHint}>{tripShape}</Text>
      {!!bonus.expires_at && <Text style={s.bonusAdviceHint}>Vence hoy/local: {localTimeLabel(bonus.expires_at)}</Text>}
    </View>
  );
};

const BonusPreview = ({ bonus, cfg }) => {
  const c = calcBonus(bonus, cfg);
  const isWorthIt = c.valueAfterTime >= 0;
  return (
    <View style={s.preview}>
      <PreviewRow label="Bono" value={fmtMXN(c.amount)} />
      <PreviewRow label="Gas extra" value={`-${fmtMXN(c.gas)}`} color={C.red} />
      {!!c.extraMin && <PreviewRow label="Tiempo vs meta" value={`-${fmtMXN(c.targetCost)}`} color={C.red} />}
      <View style={s.divider} />
      <PreviewRow label="NETO DEL BONO" value={fmtMXN(c.net)} color={c.net >= 0 ? C.teal : C.red} bold />
      {!!c.extraMin && (
        <PreviewRow
          label={isWorthIt ? 'Conveniencia' : 'Riesgo'}
          value={isWorthIt ? 'Conviene' : 'Apenas conviene'}
          color={isWorthIt ? C.teal : C.red}
          bold
        />
      )}
    </View>
  );
};

const PreviewRow = ({ label, value, color, bold }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginVertical: 3 }}>
    <Text style={{ color: C.dim, fontSize: 13 }}>{label}</Text>
    <Text style={{ color: color || C.text, fontSize: 13, fontWeight: bold ? '700' : '400' }}>{value}</Text>
  </View>
);

const s = StyleSheet.create({
  safe:       { flex: 1, backgroundColor: C.bg },
  scroll:     { padding: 16, paddingBottom: 100 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 },
  logoText:   { fontSize: 22, fontWeight: '900', color: C.accent, letterSpacing: 2 },
  userName:   { fontSize: 11, color: C.dim, letterSpacing: 1, marginTop: 2 },
  todayLabel: { fontSize: 10, color: C.dim, letterSpacing: 1, textAlign: 'right' },
  todayNet:   { fontSize: 24, fontWeight: '800' },

  proBanner:  {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: `${C.accent}14`, borderWidth: 1, borderColor: `${C.accent}55`,
    borderRadius: 12, padding: 14, marginBottom: 14,
  },
  proTitle:   { fontSize: 12, fontWeight: '800', color: C.accent, letterSpacing: 1 },
  proText:    { fontSize: 11, color: C.text, lineHeight: 17, marginTop: 3 },
  proCta:     { fontSize: 12, fontWeight: '900', color: '#000', backgroundColor: C.accent, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8 },

  gpsBtn: {
    backgroundColor: C.card, borderWidth: 2, borderColor: C.border,
    borderRadius: 16, padding: 24, alignItems: 'center', marginBottom: 14,
  },
  gpsBtnActive: { borderColor: C.teal, backgroundColor: `${C.teal}12` },
  gpsBtnIcon:   { fontSize: 32, marginBottom: 6 },
  gpsBtnText:   { fontSize: 14, fontWeight: '800', color: C.text, letterSpacing: 1.5 },
  gpsBtnSub:    { fontSize: 11, color: C.dim, marginTop: 4 },
  gpsStats:     { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  gpsStat:      { fontSize: 20, fontWeight: '700', color: C.teal },
  gpsLive:      { fontSize: 10, color: C.teal, marginTop: 6, letterSpacing: 1 },

  actions:    { flexDirection: 'row', gap: 10, marginBottom: 14 },
  actionBtn:  {
    flex: 1, backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, padding: 16, alignItems: 'center',
  },
  actionIcon: { fontSize: 24, marginBottom: 6 },
  actionText: { fontSize: 10, fontWeight: '700', color: C.dim, letterSpacing: 1 },

  bonusSection: { marginBottom: 16 },
  bonusCard: {
    backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    padding: 12, marginBottom: 8,
  },
  bonusHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  bonusTitle:  { fontSize: 11, fontWeight: '800', color: C.accent, letterSpacing: 0.8 },
  bonusMeta:   { fontSize: 11, color: C.dim, marginTop: 3 },
  bonusAmount: { fontSize: 18, fontWeight: '900', color: C.text },
  progressTrack: {
    height: 7, backgroundColor: C.card2, borderRadius: 999,
    overflow: 'hidden', marginTop: 10,
  },
  progressFill: { height: 7, backgroundColor: C.teal, borderRadius: 999 },
  bonusFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  bonusVerdict: { fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  bonusNet: { fontSize: 11, color: C.dim },
  bonusAdviceStack: { marginTop: 10 },
  bonusAdvice: {
    backgroundColor: C.card2, borderRadius: 10, borderWidth: 1,
    padding: 12, marginTop: 8,
  },
  bonusAdviceHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: 10 },
  bonusAdviceTitle: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  bonusAdviceAmount: { fontSize: 13, fontWeight: '900', color: C.text },
  bonusAdviceText: { fontSize: 12, color: C.text, lineHeight: 18, marginTop: 6 },
  bonusAdviceHint: { fontSize: 11, color: C.dim, lineHeight: 17, marginTop: 5 },
  progressBtn: {
    width: 32, height: 32, borderRadius: 8, borderWidth: 1,
    borderColor: C.border, alignItems: 'center', justifyContent: 'center',
    backgroundColor: C.card2,
  },
  progressBtnText: { fontSize: 18, fontWeight: '900', color: C.text, lineHeight: 20 },

  statsRow:   { flexDirection: 'row', gap: 8, marginBottom: 16 },
  statBox:    { flex: 1, backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.border, padding: 12 },
  statLabel:  { fontSize: 9, color: C.dim, letterSpacing: 1, fontWeight: '700', marginBottom: 4 },
  statValue:  { fontSize: 16, fontWeight: '800', color: C.text },

  sectionTitle: { fontSize: 10, fontWeight: '700', color: C.dim, letterSpacing: 1.5, marginBottom: 8 },
  tripRow:    {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.card, borderRadius: 10, borderWidth: 1, borderColor: C.border,
    padding: 12, marginBottom: 6,
  },
  tripLeft:   { width: 60 },
  tripPlat:   { fontSize: 10, fontWeight: '700', color: C.accent, letterSpacing: 1 },
  tripTime:   { fontSize: 11, color: C.dim, marginTop: 2 },
  tripFare:   { fontSize: 14, color: C.text, marginRight: 12 },
  tripNet:    { fontSize: 14, fontWeight: '700', minWidth: 70, textAlign: 'right' },
  bonusRowTitle: { fontSize: 10, fontWeight: '800', color: C.text, letterSpacing: 0.8 },

  // Modal
  modal:      { flex: 1, backgroundColor: C.bg, padding: 20, paddingTop: 16 },
  modalHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: C.accent, letterSpacing: 1.5 },
  platformRow:{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  platformWrap:{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 4 },
  platBtn:    {
    flexGrow: 1, paddingVertical: 9, paddingHorizontal: 8, borderRadius: 8,
    borderWidth: 1, borderColor: C.border, alignItems: 'center',
  },
  platBtnActive: { borderColor: C.accent, backgroundColor: `${C.accent}15` },
  platText:   { fontSize: 10, fontWeight: '700', color: C.dim, letterSpacing: 0.5 },
  input:      {
    backgroundColor: C.card, borderWidth: 1, borderColor: C.border,
    borderRadius: 10, padding: 13, color: C.text, fontSize: 16,
  },
  twoCol:     { flexDirection: 'row' },
  sublabel:   { fontSize: 10, color: C.dim, marginBottom: 4 },
  notesInput: { minHeight: 76, textAlignVertical: 'top' },
  segmentRow: {
    flexDirection: 'row', backgroundColor: C.card, borderWidth: 1,
    borderColor: C.border, borderRadius: 10, padding: 4, marginBottom: 18,
  },
  segmentBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  segmentBtnActive: { backgroundColor: `${C.accent}18` },
  segmentText: { fontSize: 11, fontWeight: '800', color: C.dim, letterSpacing: 1 },
  segmentTextActive: { color: C.accent },
  preview:    {
    backgroundColor: C.card2, borderRadius: 10, borderWidth: 1,
    borderColor: C.border, padding: 14, marginTop: 16,
  },
  divider:    { height: 1, backgroundColor: C.border, marginVertical: 8 },
  saveBtn:    {
    backgroundColor: C.accent, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 20, marginBottom: 40,
  },
  saveBtnDisabled: { opacity: 0.3 },
  saveBtnText:{ fontSize: 13, fontWeight: '800', color: '#000', letterSpacing: 1 },
});
