import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icons';
import { buildRecap, drawRecap, shareRecapImage } from '../lib/recap';

interface RecapModalProps {
  /** Finished session to sum up; null closes the window. */
  session: any | null;
  history: any[];
  onClose: () => void;
  /** Plain-text summary, for apps that only take text. */
  onCopyText: (session: any) => void;
  onResult: (text: string, type?: 'success' | 'error' | 'info') => void;
}

/** End-of-session card in story format, shared as an image. */
export function RecapModal({ session, history, onClose, onCopyText, onResult }: RecapModalProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const recap = useMemo(() => (session ? buildRecap(session, history) : null), [session, history]);
  const closeHandler = useRef(onClose);
  useEffect(() => {
    closeHandler.current = onClose;
  });

  useEffect(() => {
    if (!recap) return;
    let cancelled = false;
    const canvas = canvasRef.current ?? document.createElement('canvas');
    canvasRef.current = canvas;
    setPreview(null);
    drawRecap(canvas, recap).then(() => {
      if (!cancelled) setPreview(canvas.toDataURL('image/png'));
    });
    return () => {
      cancelled = true;
    };
  }, [recap]);

  useEffect(() => {
    if (!session) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeHandler.current();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [session]);

  if (!session || !recap) return null;

  const share = async () => {
    if (!canvasRef.current) return;
    setIsSharing(true);
    try {
      const result = await shareRecapImage(canvasRef.current, recap);
      if (result === 'downloaded') onResult('Image enregistrée dans tes téléchargements', 'success');
    } catch {
      onResult("Impossible de créer l'image", 'error');
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card recap-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="recap-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-head">
          <div>
            <h2 id="recap-title">Récap de séance</h2>
            <p>
              {recap.records.length > 0
                ? `${recap.records.length} record${recap.records.length > 1 ? 's' : ''} battu${recap.records.length > 1 ? 's' : ''} : de quoi le montrer.`
                : 'Une image au format story, prête à partager.'}
            </p>
          </div>
          <button type="button" className="btn-icon" onClick={onClose} aria-label="Fermer">
            <Icon name="close" size={20} />
          </button>
        </div>

        <div className="recap-preview">
          {preview ? (
            <img src={preview} alt={`Récap : ${recap.title}, ${recap.volume} kg soulevés en ${recap.sets} séries`} />
          ) : (
            <div className="recap-preview-loading" aria-label="Préparation de l'image" />
          )}
        </div>

        <div className="recap-actions">
          <button type="button" className="btn-primary" onClick={share} disabled={!preview || isSharing}>
            <Icon name="share" size={16} />
            {isSharing ? 'Préparation…' : "Partager l'image"}
          </button>
          <button type="button" className="text-action" onClick={() => onCopyText(session)}>
            Copier en texte
          </button>
        </div>
      </div>
    </div>
  );
}
