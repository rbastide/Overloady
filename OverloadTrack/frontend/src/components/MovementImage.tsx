import { useState } from 'react';
import { displayName, exerciseImage } from '../lib/exerciseNames';
import { Icon } from './Icons';

interface MovementImageProps {
  /** The stored (English) exercise name. */
  name?: string | null;
  /** In a session nothing is downloaded until the athlete asks to see the movement. */
  onDemand?: boolean;
}

/**
 * The picture of a movement, when wger has one. Loaded lazily (or on demand), and it simply
 * disappears behind a short note when the network or the image is missing.
 */
export function MovementImage({ name, onDemand = false }: MovementImageProps) {
  const src = exerciseImage(name);
  const [shown, setShown] = useState(!onDemand);
  const [failed, setFailed] = useState(false);

  if (!src) return null;

  if (!shown) {
    return (
      <button type="button" className="text-action movement-toggle" onClick={() => setShown(true)}>
        <Icon name="eye" size={15} />
        Voir le mouvement
      </button>
    );
  }

  if (failed) {
    return <p className="movement-note">Image indisponible pour l’instant (réseau ?).</p>;
  }

  return (
    <figure className="movement-figure">
      <img
        src={src}
        alt={`Illustration du mouvement : ${displayName(name)}`}
        loading="lazy"
        decoding="async"
        width={320}
        height={240}
        onError={() => setFailed(true)}
      />
      {onDemand && (
        <button type="button" className="text-action movement-toggle" onClick={() => setShown(false)}>
          Masquer l’image
        </button>
      )}
    </figure>
  );
}
