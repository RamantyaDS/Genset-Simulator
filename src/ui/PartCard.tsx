import { PART_INFO } from '../partsInfo';
import { useUI } from '../store';

/** Name and job of the part the user clicked on the model. */
export function PartCard() {
  const focus = useUI((s) => s.focus);
  const info = focus ? PART_INFO[focus] : undefined;
  if (!info) return null;
  return (
    <div className="part-card" role="status">
      <div>
        <b>{info.name}</b>
        <button className="x" onClick={() => useUI.getState().set({ focus: null })} aria-label="Tutup keterangan">
          ×
        </button>
      </div>
      <p>{info.desc}</p>
    </div>
  );
}
