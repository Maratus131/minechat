import type { PropsWithChildren } from 'react';
import { StyleSheet, View } from 'react-native';
import { colors } from './ui';

/** Decorative block, ore and pickaxe motifs stay behind the native virtualized list. */
export function ChatBackground({ children }: PropsWithChildren) {
  return <View style={styles.surface}>
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      {[0, 1, 2].map((row) => <View key={row} style={[styles.tile, { top: `${row * 34 + 5}%` }]}>
        <View style={[styles.block, styles.grass]}><View style={styles.grassTop} /><View style={styles.soilPixel} /></View>
        <View style={styles.pickaxe}><View style={styles.handle} /><View style={styles.blade} /><View style={styles.bladeTip} /></View>
        <View style={[styles.block, styles.ore]}><View style={styles.orePixel} /><View style={[styles.orePixel, styles.orePixelSecond]} /></View>
      </View>)}
    </View>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  surface: { flex: 1, position: 'relative', backgroundColor: colors.chat, overflow: 'hidden' },
  tile: { position: 'absolute', left: 0, right: 0, height: 140, opacity: 0.35 },
  block: { position: 'absolute', width: 32, height: 32, borderWidth: 2, borderColor: '#526044' },
  grass: { left: '10%', top: 10 },
  grassTop: { height: 8, backgroundColor: '#526044' },
  soilPixel: { width: 5, height: 5, backgroundColor: '#526044', marginTop: 7, marginLeft: 12 },
  pickaxe: { position: 'absolute', left: '64%', top: 12, width: 40, height: 40 },
  handle: { position: 'absolute', width: 6, height: 32, top: 10, left: 13, backgroundColor: '#526044', transform: [{ rotate: '45deg' }] },
  blade: { position: 'absolute', width: 30, height: 6, top: 4, left: 4, backgroundColor: '#526044' },
  bladeTip: { position: 'absolute', width: 6, height: 17, top: 4, left: 28, backgroundColor: '#526044' },
  ore: { left: '41%', top: 100 },
  orePixel: { position: 'absolute', width: 6, height: 6, top: 5, left: 6, backgroundColor: '#526044' },
  orePixelSecond: { top: 16, left: 17 },
});
