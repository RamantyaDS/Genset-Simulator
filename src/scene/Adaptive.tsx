// Keeps slower laptops smooth: watches the frame rate and drops the render resolution (and, through `onLow`, the
// costly effects) when it falls, raising it again when there is headroom.
import { PerformanceMonitor } from '@react-three/drei';
import { useThree } from '@react-three/fiber';

export const MAX_DPR = Math.min(1.5, typeof devicePixelRatio === 'number' ? devicePixelRatio : 1);

export function Adaptive({ onLow }: { onLow?: () => void }) {
  const setDpr = useThree((s) => s.setDpr);
  return (
    <PerformanceMonitor
      flipflops={3}
      onDecline={() => {
        setDpr(1);
        onLow?.();
      }}
      onIncline={() => setDpr(MAX_DPR)}
      onFallback={() => {
        setDpr(0.85);
        onLow?.();
      }}
    />
  );
}
