// ============================================================
// SymbolView — iOS SF Symbol icon component
// ============================================================
//
// The app targets iOS only, so every icon renders through the
// native SF Symbols API (expo-symbols). No vector-icon fallback
// or second icon package is bundled.
// ============================================================

import { SymbolView as ExpoSymbolView } from 'expo-symbols';

// ----------------------------------------------------------------
// Props
// ----------------------------------------------------------------

export interface SymbolViewProps {
  name: string;
  size?: number;
  weight?:
    | 'unspecified'
    | 'ultraLight'
    | 'thin'
    | 'light'
    | 'regular'
    | 'medium'
    | 'semibold'
    | 'bold'
    | 'heavy'
    | 'black';
  tintColor?: string;
  style?: any;
}

// ----------------------------------------------------------------
// Component
// ----------------------------------------------------------------

export function SymbolView({
  name,
  size = 24,
  weight,
  tintColor,
  style,
}: SymbolViewProps) {
  return (
    <ExpoSymbolView
      name={name as any}
      size={size}
      tintColor={tintColor}
      style={style}
      weight={weight as any}
    />
  );
}

export default SymbolView;
