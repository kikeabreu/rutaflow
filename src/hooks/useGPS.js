import { useState, useEffect, useRef, useCallback } from 'react';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';

export const GPS_TASK = 'rutaflow-gps-background';

// ─── REGISTER BACKGROUND TASK (must be at module level, outside component) ───
TaskManager.defineTask(GPS_TASK, ({ data, error }) => {
  if (error) { console.error('[GPS Task]', error); return; }
  if (data) {
    const { locations } = data;
    // Emit event so the hook can receive it
    gpsEventListeners.forEach(fn => fn(locations));
  }
});

// Simple event bus for background → foreground communication
const gpsEventListeners = new Set();

export const useGPS = () => {
  const [isTracking, setIsTracking]     = useState(false);
  const [distanceKm, setDistanceKm]     = useState(0);
  const [elapsedMin, setElapsedMin]     = useState(0);
  const [currentCoord, setCurrentCoord] = useState(null);
  const [startCoord, setStartCoord]     = useState(null);
  const [hasPermission, setHasPermission] = useState(false);

  const lastCoordRef  = useRef(null);
  const startTimeRef  = useRef(null);
  const timerRef      = useRef(null);
  const distanceRef   = useRef(0);

  // ─── Request permissions ─────────────────────────────────────────────────
  const requestPermissions = useCallback(async () => {
    const { status: fg } = await Location.requestForegroundPermissionsAsync();
    if (fg !== 'granted') return false;
    const { status: bg } = await Location.requestBackgroundPermissionsAsync();
    setHasPermission(bg === 'granted');
    return bg === 'granted';
  }, []);

  useEffect(() => {
    requestPermissions();
  }, []);

  // ─── Handle incoming background locations ────────────────────────────────
  const handleBackgroundLocations = useCallback((locations) => {
    locations.forEach(loc => {
      const coord = loc.coords;
      setCurrentCoord({ lat: coord.latitude, lng: coord.longitude });

      if (lastCoordRef.current) {
        const d = haversineKm(lastCoordRef.current, { lat: coord.latitude, lng: coord.longitude });
        if (d > 0.01) { // ignore < 10m noise
          distanceRef.current += d;
          setDistanceKm(parseFloat(distanceRef.current.toFixed(2)));
        }
      }
      lastCoordRef.current = { lat: coord.latitude, lng: coord.longitude };
    });
  }, []);

  // ─── Start tracking ───────────────────────────────────────────────────────
  const startTracking = useCallback(async () => {
    const ok = await requestPermissions();
    if (!ok) return false;

    // Get initial position
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const initCoord = { lat: loc.coords.latitude, lng: loc.coords.longitude };

    lastCoordRef.current = initCoord;
    startTimeRef.current = Date.now();
    distanceRef.current  = 0;

    setStartCoord(initCoord);
    setCurrentCoord(initCoord);
    setDistanceKm(0);
    setElapsedMin(0);
    setIsTracking(true);

    // Start background location
    await Location.startLocationUpdatesAsync(GPS_TASK, {
      accuracy:                    Location.Accuracy.High,
      timeInterval:                5000,   // every 5 seconds
      distanceInterval:            20,     // or every 20 meters
      showsBackgroundLocationIndicator: true,
      foregroundService: {
        notificationTitle:   'RutaFlow GPS activo',
        notificationBody:    'Registrando tu ruta en segundo plano',
        notificationColor:   '#f0a500',
      },
    });

    // Subscribe to background events
    gpsEventListeners.add(handleBackgroundLocations);

    // Timer for elapsed minutes
    timerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        const mins = (Date.now() - startTimeRef.current) / 60000;
        setElapsedMin(parseFloat(mins.toFixed(1)));
      }
    }, 10000); // update every 10s

    return true;
  }, [requestPermissions, handleBackgroundLocations]);

  // ─── Stop tracking ────────────────────────────────────────────────────────
  const stopTracking = useCallback(async () => {
    const running = await Location.hasStartedLocationUpdatesAsync(GPS_TASK).catch(() => false);
    if (running) await Location.stopLocationUpdatesAsync(GPS_TASK);

    gpsEventListeners.delete(handleBackgroundLocations);
    clearInterval(timerRef.current);
    setIsTracking(false);

    return {
      km:         distanceRef.current,
      min:        startTimeRef.current ? (Date.now() - startTimeRef.current) / 60000 : 0,
      startCoord: startCoord,
      endCoord:   lastCoordRef.current,
    };
  }, [handleBackgroundLocations, startCoord]);

  // ─── Cleanup on unmount ───────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      gpsEventListeners.delete(handleBackgroundLocations);
    };
  }, [handleBackgroundLocations]);

  return {
    isTracking,
    distanceKm,
    elapsedMin,
    currentCoord,
    startCoord,
    hasPermission,
    startTracking,
    stopTracking,
    requestPermissions,
  };
};

// ─── HAVERSINE DISTANCE (km) ──────────────────────────────────────────────────
const haversineKm = (a, b) => {
  const R  = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
    Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(h));
};
