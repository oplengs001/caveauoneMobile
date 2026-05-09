export const Colors = {
  warehouse: {
    background: '#0f172a',
    card: '#1e293b',
    border: '#334155',
    text: '#ffffff',
    textSecondary: '#64748b',
    primary: '#4f46e5',
    secondary: '#10b981',
    accent: '#f59e0b',
    danger: '#ef4444',
    logoBg: '#4f46e5',
  },
  store: {
    background: '#fdfcf8', // Vintage Cream
    card: '#ffffff',
    border: '#e2e8f0',
    text: '#1a1a1a', // Charcoal
    textSecondary: '#64748b',
    primary: '#4c0519', // Deep Burgundy
    secondary: '#1e1b4b', // Midnight Blue
    accent: '#a16207', // Burnished Gold
    danger: '#991b1b',
    logoBg: '#4c0519',
  }
};

export type ThemeType = typeof Colors.warehouse;
