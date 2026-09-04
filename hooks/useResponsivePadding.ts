import { useWindowDimensions } from "react-native";

export interface ResponsivePaddingResult {
  horizontalPadding: number;
  isTablet: boolean;
  isLandscape: boolean;
  width: number;
  height: number;
}

/**
 * Reusable hook to apply uniform horizontal padding across screens,
 * eliminating stretched cards on iPads/tablets while keeping mobile views natural.
 *
 * - Tablet Landscape: Centers content to ~780px max width.
 * - Tablet Portrait: Centers content to ~660px max width.
 * - Phone: Uses defaultMobilePadding (default 20px).
 */
export function useResponsivePadding(defaultMobilePadding: number = 20): ResponsivePaddingResult {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const isTablet = width >= 768 || (isLandscape && width >= 680);

  const horizontalPadding = isTablet
    ? isLandscape
      ? Math.max(64, Math.round((width - 780) / 2))
      : Math.max(48, Math.round((width - 660) / 2))
    : defaultMobilePadding;

  return {
    horizontalPadding,
    isTablet,
    isLandscape,
    width,
    height,
  };
}
