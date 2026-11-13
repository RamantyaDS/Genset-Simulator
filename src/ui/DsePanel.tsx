import { useEffect, useRef, useState } from 'react';
import { BUTTONS, drawModule, H, press, W } from '../dse';
import { explain } from '../explain';
import { sim, useUI } from '../store';

export function DsePanel() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState('');
  useUI((s) => s.tick);

  useEffect(() => {
    let id = 0;
    const draw = () => {
      const c = canvas.current;
      if (c) drawModule(c.getContext('2d')!, sim);
      id = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(id);
  }, []);

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
          if (b) press(sim, b.id);
        }}
      />
      <p className="dse-tip">{hover || 'Klik tombol di panel. ◀ ▶ untuk ganti halaman layar, ▲ ▼ untuk menggulir.'}</p>
      <p className="explain">{explain(sim)}</p>
    </section>
  );
}
