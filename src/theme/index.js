// ─── RUTAFLOW THEME ───────────────────────────────────────────────────────────
export const C = {
  bg:      '#0d0f14',
  card:    '#161920',
  card2:   '#1c2028',
  border:  '#2a2f3a',
  bord2:   '#333a47',
  text:    '#e8eaf0',
  dim:     '#5a6070',
  accent:  '#f0a500',
  teal:    '#00c9a7',
  red:     '#ff4055',
  blue:    '#4a9eff',
};

export const F = {
  mono: 'SpaceMono',   // fallback to system mono
};

export const S = {
  card: {
    backgroundColor: C.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.2,
    color: C.dim,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.5,
    color: C.text,
  },
  value: {
    fontSize: 22,
    fontWeight: '800',
    color: C.text,
  },
  accentValue: {
    fontSize: 22,
    fontWeight: '800',
    color: C.teal,
  },
  btn: {
    borderRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
};
