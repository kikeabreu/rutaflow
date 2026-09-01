// ─── CALC TRIP NET PROFIT ─────────────────────────────────────────────────────
export const calcTrip = (trip, cfg) => {
  const fare      = parseFloat(trip.fare)       || 0;
  const gKm       = parseFloat(trip.gps_km)     || 0;
  const gMin      = parseFloat(trip.gps_min)    || 0;
  const pickupKm  = parseFloat(trip.pickup_km)  || 0;
  const pickupMin = parseFloat(trip.pickup_min) || 0;
  const destKm    = parseFloat(trip.dest_km)    || 0;
  const destMin   = parseFloat(trip.dest_min)   || 0;

  const km  = gKm  > 0 ? gKm  : pickupKm  + destKm;
  const min = gMin > 0 ? gMin : pickupMin + destMin;

  const gasPerKm = (cfg.gasPricePerLiter || 24) / (cfg.kmPerLiter || 12);
  const gas      = km * gasPerKm;
  const net      = fare - gas;

  return { fare, km, min, gas, net };
};

export const calcBonus = (bonus, cfg) => {
  const amount = parseFloat(bonus.amount) || 0;
  const extraKm = parseFloat(bonus.extra_km) || 0;
  const extraMin = parseFloat(bonus.extra_min) || 0;
  const completedTrips = parseInt(bonus.completed_trips, 10) || 0;
  const requiredTrips = parseInt(bonus.required_trips, 10) || 0;

  const gasPerKm = (cfg.gasPricePerLiter || 24) / (cfg.kmPerLiter || 12);
  const gas = extraKm * gasPerKm;
  const net = amount - gas;
  const targetCost = extraMin > 0 ? ((cfg.targetHourlyRate || 200) * extraMin) / 60 : 0;
  const valueAfterTime = net - targetCost;
  const progress = requiredTrips > 0 ? Math.min(completedTrips / requiredTrips, 1) : 0;

  return { amount, extraKm, extraMin, gas, net, targetCost, valueAfterTime, progress };
};

export const getDriverTimeZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City';
  } catch {
    return 'America/Mexico_City';
  }
};

const localParts = (value, timeZone = getDriverTimeZone()) => {
  const date = value instanceof Date ? value : new Date(value || Date.now());
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  return Object.fromEntries(parts.filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
};

export const localDateKey = (value, timeZone = getDriverTimeZone()) => {
  const p = localParts(value, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
};

export const localTimeLabel = (value, timeZone = getDriverTimeZone()) => {
  const p = localParts(value, timeZone);
  return `${p.hour}:${p.minute}`;
};

export const isSameLocalDay = (value, reference = new Date(), timeZone = getDriverTimeZone()) =>
  localDateKey(value, timeZone) === localDateKey(reference, timeZone);

export const parseLocalDeadline = (dateText, timeText = '23:59') => {
  const cleanDate = String(dateText || '').trim();
  const cleanTime = String(timeText || '23:59').trim();
  const m = cleanDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const t = cleanTime.match(/^(\d{1,2}):(\d{2})$/);
  if (!m || !t) return null;
  const hour = Math.min(parseInt(t[1], 10), 23);
  const min = Math.min(parseInt(t[2], 10), 59);
  return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10), hour, min, 0, 0);
};

export const evaluateTripForBonus = (trip, bonus, cfg, now = new Date()) => {
  const tripCalc = calcTrip(trip, cfg);
  const bonusCalc = calcBonus(bonus, cfg);
  const required = parseInt(bonus.required_trips, 10) || 0;
  const completed = parseInt(bonus.completed_trips, 10) || 0;
  const remaining = Math.max(required - completed, 0);
  const remainingAfterTrip = Math.max(remaining - 1, 0);
  const expiresAt = bonus.expires_at ? new Date(bonus.expires_at) : null;
  const minLeft = expiresAt ? Math.max((expiresAt.getTime() - now.getTime()) / 60000, 0) : null;
  const avgMinNeeded = minLeft !== null && remainingAfterTrip > 0 ? minLeft / remainingAfterTrip : null;
  const bonusShare = remaining > 0 ? bonusCalc.net / remaining : 0;
  const effectiveNet = tripCalc.net + bonusShare;
  const effectiveHourly = tripCalc.min > 0 ? effectiveNet / (tripCalc.min / 60) : 0;
  const baseHourly = tripCalc.min > 0 ? tripCalc.net / (tripCalc.min / 60) : 0;
  const targetHourly = cfg.targetHourlyRate || 200;
  const profitable = effectiveHourly >= targetHourly && tripCalc.net >= 0;
  const helpsProgress = remaining > 0;
  const enoughTime = minLeft === null || minLeft > Math.max(tripCalc.min, 1);
  const paceOk = avgMinNeeded === null || avgMinNeeded >= 12;

  let verdict = 'neutral';
  if (!helpsProgress) verdict = 'done';
  else if (!enoughTime) verdict = 'skip';
  else if (profitable && paceOk) verdict = 'take';
  else if (effectiveNet > 0 && enoughTime) verdict = 'maybe';
  else verdict = 'skip';

  return {
    trip: tripCalc,
    bonus: bonusCalc,
    remaining,
    remainingAfterTrip,
    minLeft,
    avgMinNeeded,
    bonusShare,
    effectiveNet,
    effectiveHourly,
    baseHourly,
    targetHourly,
    profitable,
    helpsProgress,
    enoughTime,
    paceOk,
    verdict,
  };
};

// ─── FORMAT HELPERS ───────────────────────────────────────────────────────────
export const fmtMXN = (n) =>
  '$' + (Number(n) || 0).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const fmt = (n, dec = 1) =>
  (Number(n) || 0).toFixed(dec);

// ─── BUILD AI CONTEXT ─────────────────────────────────────────────────────────
export const buildCtx = (trips, cfg, bonuses = []) => {
  if (!trips?.length && !bonuses?.length) return 'Sin viajes registrados aún.';

  const now   = Date.now();
  const tz = getDriverTimeZone();
  const recent = trips.filter(t => new Date(t.created_at || t.end_time || 0).getTime() >= now - 30 * 86400000);

  const sum = (arr) => arr.reduce((a, t) => {
    const c = calcTrip(t, cfg);
    return { net: a.net + c.net, km: a.km + c.km, gas: a.gas + c.gas, min: a.min + c.min, n: a.n + 1 };
  }, { net: 0, km: 0, gas: 0, min: 0, n: 0 });

  const sAll = sum(trips);
  const s30  = sum(recent);

  // Mejor hora
  const bh = {};
  trips.forEach(t => {
    const h = new Date(t.created_at || t.end_time || 0).getHours();
    if (!bh[h]) bh[h] = { net: 0, n: 0 };
    bh[h].net += calcTrip(t, cfg).net;
    bh[h].n++;
  });
  const horaSort = Object.entries(bh).sort((a, b) => (b[1].net / b[1].n) - (a[1].net / a[1].n));
  const bestH  = horaSort.slice(0, 3).map(([h, d]) => `${h}:00(${fmtMXN(d.net / d.n)}/viaje)`).join(', ');
  const worstH = horaSort.slice(-2).map(([h, d]) => `${h}:00(${fmtMXN(d.net / d.n)}/viaje)`).join(', ');

  // Por plataforma
  const bp = {};
  trips.forEach(t => {
    const p = t.platform || 'uber';
    if (!bp[p]) bp[p] = { net: 0, n: 0 };
    bp[p].net += calcTrip(t, cfg).net;
    bp[p].n++;
  });
  const platS = Object.entries(bp).map(([p, d]) => `${p}:${fmtMXN(d.net / d.n)}/viaje`).join(' | ');

  // Por día de semana
  const bd = {};
  trips.forEach(t => {
    const d = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'][new Date(t.created_at || t.end_time || 0).getDay()];
    if (!bd[d]) bd[d] = { net: 0, n: 0 };
    bd[d].net += calcTrip(t, cfg).net;
    bd[d].n++;
  });
  const diaS = Object.entries(bd).sort((a, b) => (b[1].net / b[1].n) - (a[1].net / a[1].n))
    .map(([d, v]) => `${d}:${fmtMXN(v.net / v.n)}/viaje`).join(', ');

  // Tendencia semana
  const w1    = trips.filter(t => new Date(t.created_at || t.end_time || 0).getTime() >= now - 7 * 86400000);
  const w2    = trips.filter(t => { const ms = new Date(t.created_at || t.end_time || 0).getTime(); return ms >= now - 14 * 86400000 && ms < now - 7 * 86400000; });
  const wNet1 = w1.reduce((a, t) => a + calcTrip(t, cfg).net, 0);
  const wNet2 = w2.reduce((a, t) => a + calcTrip(t, cfg).net, 0);
  const tend  = wNet2 > 0 ? `${wNet1 > wNet2 ? '+' : ''}${(((wNet1 - wNet2) / wNet2) * 100).toFixed(0)}% vs semana anterior` : 'primera semana';

  // Últimos 5 viajes
  const last5 = trips.slice(0, 5).map(t => {
    const c = calcTrip(t, cfg);
    const d = new Date(t.created_at || t.end_time || 0);
    return `${d.toLocaleDateString('es-MX')} ${d.getHours()}h ${t.platform || 'uber'} $${t.fare} neto:${fmtMXN(c.net)}`;
  }).join(' | ');

  const fixedMonth = (cfg.monthlyRent || 0) + (cfg.insurance || 0) + (cfg.tires || 0) + (cfg.maintenance || 0);
  const paidBonuses = bonuses.filter(b => ['paid', 'earned'].includes(b.status));
  const activeBonuses = bonuses.filter(b => b.status === 'active');
  const bonusNet = paidBonuses.reduce((a, b) => a + calcBonus(b, cfg).net, 0);
  const activeBonusS = activeBonuses.slice(0, 5).map(b => {
    const c = calcBonus(b, cfg);
    const required = parseInt(b.required_trips, 10) || 0;
    const completed = parseInt(b.completed_trips, 10) || 0;
    const remaining = Math.max(required - completed, 0);
    const expiresAt = b.expires_at ? new Date(b.expires_at) : null;
    const minLeft = expiresAt ? Math.max((expiresAt.getTime() - now) / 60000, 0) : null;
    const avgMinNeeded = minLeft !== null && remaining > 0 ? minLeft / remaining : null;
    const deadline = expiresAt ? `${localDateKey(expiresAt, tz)} ${localTimeLabel(expiresAt, tz)}` : 'sin vencimiento';
    const pace = avgMinNeeded ? `ritmo max ${fmt(avgMinNeeded, 0)} min/viaje` : 'sin ritmo calculable';
    return `${b.platform || 'uber'} ${b.bonus_type || 'bono'} ${completed}/${required || '-'} viajes, faltan ${remaining}, vence ${deadline}, ${pace}, monto ${fmtMXN(c.amount)}, neto bono ${fmtMXN(c.net)}, costo gas extra ${fmtMXN(c.gas)}`;
  }).join(' | ');

  return `=== CONTEXTO RUTAFLOW ===
FECHA LOCAL CONDUCTOR: ${localDateKey(new Date(), tz)} ${localTimeLabel(new Date(), tz)} | TZ:${tz}
CONDUCTOR: ${cfg.name || 'sin nombre'} | Meta: ${fmtMXN(cfg.targetHourlyRate)}/hr | Gas: $${cfg.gasPricePerLiter}/L ${cfg.kmPerLiter}km/L
COSTOS FIJOS: ${fmtMXN(fixedMonth)}/mes
HISTÓRICO TOTAL (${sAll.n} viajes): neto ${fmtMXN(sAll.net)}, ${fmt(sAll.km, 0)}km, ${(sAll.min / 60).toFixed(0)}hrs, prom ${fmtMXN(sAll.n > 0 ? sAll.net / sAll.n : 0)}/viaje
ÚLTIMOS 30 DÍAS (${s30.n} viajes): neto ${fmtMXN(s30.net)}, ${fmt(s30.km, 0)}km, ${fmtMXN(s30.gas)} gas, ${(s30.min / 60).toFixed(1)}hrs, ${fmtMXN(s30.min > 0 ? s30.net / (s30.min / 60) : 0)}/hr
BONOS COBRADOS: ${paidBonuses.length} registros, neto estimado ${fmtMXN(bonusNet)}
BONOS ACTIVOS: ${activeBonusS || 'sin bonos activos'}
TENDENCIA: ${tend}
MEJORES HORAS: ${bestH || 'sin datos'} | PEORES: ${worstH || 'sin datos'}
POR DÍA: ${diaS || 'sin datos'}
POR PLATAFORMA: ${platS || 'sin datos'}
ÚLTIMOS 5 VIAJES: ${last5 || 'sin datos'}
REGLA DE RESPUESTA: maximo 5 bullets, directo, con numeros. Si hay bono activo, prioriza si conviene perseguirlo sin bajar de la meta por hora.`;
};
