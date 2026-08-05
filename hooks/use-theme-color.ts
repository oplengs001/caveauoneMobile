import { Colors } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';

export function useThemeColor(
  props: { light?: string; dark?: string },
  colorName: keyof typeof Colors.warehouse
) {
  const { profile } = useAuth();
  const isStore = profile?.role === 'store' || profile?.role === 'store_manager' || profile?.role === 'store_staff';
  const role = isStore ? 'store' : 'warehouse';

  // Map props for compatibility: light -> store, dark -> warehouse
  const themePropKey = role === 'store' ? 'light' : 'dark';
  const colorFromProps = props[themePropKey];

  if (colorFromProps) {
    return colorFromProps;
  } else {
    // Return the color from the role-based theme
    return Colors[role][colorName as keyof typeof Colors.warehouse];
  }
}
