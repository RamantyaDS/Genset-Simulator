import { useEffect, useRef, useState } from 'react';
import { BUTTONS, drawModule, H, press, W, type ButtonId } from '../dse';
import type { State } from '../sim/genset';
import { explain } from '../explain';
import { sim, useUI } from '../store';

/** The DSE7320 face, full size. Drives the single set by default; the plant passes one set's state, its own button
 *  handling and its own explanation line. */
export function DsePanel({ s = sim, onPress, note }: { s?: State; onPress?: (id: ButtonId) => void; note?: string } = {}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState('');
  useUI((s) => s.tick);

  useEffect(() => {
    let id = 0;
    const draw = () => {
      const c = canvas.current;
      if (c) drawModule(c.getContext('2d')!, s);
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(id);
  }, [s]);

  const hit = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    return BUTTONS.find((b) => Math.hypot(b.x - x, b.y - y) <= b.r + 8);
  };

  return (
    <section className="dse" aria-label="Panel kontrol DSE7320">
      <div className="dse-head">
        <span>Panel kontrol · DSE7320 MKII</span>
        <button className="x" onClick={() => useUI.getState().set({ panelOpen: false })} aria-label="Tutup panel">
          ×
        </button>
      </div>
      <canvas
        ref={canvas}
        width={W}
        height={H}
        style={{ cursor: hover ? 'pointer' : 'default' }}
        onPointerMove={(e) => setHover(hit(e)?.label ?? '')}
        onPointerLeave={() => setHover('')}
        onPointerDown={(e) => {
          const b = hit(e);
          if (b) (onPress ?? ((id) => press(sim, id)))(b.id);
        }}
      />
      <p className="dse-tip">{hover || 'Klik tombol di panel. ◀ ▶ untuk ganti halaman layar, ▲ ▼ untuk menggulir.'}</p>
      <p className="explain">{note ?? explain(s)}</p>
    </section>
  );
}
