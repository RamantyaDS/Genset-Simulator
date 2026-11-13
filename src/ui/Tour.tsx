import { useEffect } from 'react';
import { CHAPTERS, endTour, openChapter } from '../tour';
import { useUI } from '../store';

export function Tour() {
  const i = useUI((s) => s.tour)!;
  useUI((s) => s.tick);
  const c = CHAPTERS[i];
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') endTour();
      if (e.key === 'ArrowRight' && i < CHAPTERS.length - 1) openChapter(i + 1);
      if (e.key === 'ArrowLeft' && i > 0) openChapter(i - 1);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [i]);
  return (
    <aside className="tour" aria-label="Cara kerja genset">
      <div className="tour-head">
        <select value={i} onChange={(e) => openChapter(+e.target.value)} aria-label="Pilih bab">
          {CHAPTERS.map((ch, k) => (
            <option key={k} value={k}>
              {k + 1}. {ch.title}
            </option>
          ))}
        </select>
        <button className="x" onClick={endTour} aria-label="Tutup tur">
          ×
        </button>
      </div>
      <h2>
        <small>
          Bab {i + 1} dari {CHAPTERS.length}
        </small>
        {c.title}
      </h2>
      <div className="tour-body">{c.body()}</div>
      <div className="tour-nav">
        <button disabled={i === 0} onClick={() => openChapter(i - 1)}>
          ◀ Sebelumnya
        </button>
        {i < CHAPTERS.length - 1 ? (
          <button className="on" onClick={() => openChapter(i + 1)}>
            Berikutnya ▶
          </button>
        ) : (
          <button className="on" onClick={endTour}>
            Selesai
          </button>
        )}
      </div>
    </aside>
  );
}
