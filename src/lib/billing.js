export const FREE_MONTHLY_TRIP_LIMIT = 30;

export const isProProfile = (profile) => {
  if (!profile) return false;
  const plan = String(profile.plan || '').toLowerCase();
  const status = String(profile.subscription_status || '').toLowerCase();
  const proUntil = profile.pro_until ? new Date(profile.pro_until) : null;

  return (
    plan === 'pro' ||
    status === 'active' ||
    status === 'trialing' ||
    (proUntil && proUntil.getTime() > Date.now())
  );
};

export const getPaymentUrl = () =>
  process.env.EXPO_PUBLIC_STRIPE_PAYMENT_LINK ||
  process.env.EXPO_PUBLIC_MERCADOPAGO_PAYMENT_LINK ||
  '';

export const canAddTrip = (profile, monthlyTripsCount) =>
  isProProfile(profile) || monthlyTripsCount < FREE_MONTHLY_TRIP_LIMIT;
