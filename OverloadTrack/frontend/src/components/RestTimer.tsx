import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icons';
import {
  cancelRestNotification,
  enableRestNotifications,
  restNotificationsPermission,
  scheduleRestNotification,
  syncRestNotifications,
} from '../lib/restNotifications';

interface RestTimerProps {
  /** Rest duration the timer opens with (seconds). */
  initialSeconds: number;
  /** Count down right away, e.g. when a set has just been validated. */
  autoStart?: boolean;
  /** A preset was picked: the next automatic rest reuses it. */
  onDurationChange?: (seconds: number) => void;
  onClose?: () => void;
}

const PRESETS = [30, 60, 90, 120, 180];

const playBeep = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (err) {
    console.warn('Audio not available', err);
  }
};

const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
};

export const RestTimer: React.FC<RestTimerProps> = ({ initialSeconds, autoStart = false, onDurationChange, onClose }) => {
  const [initialDuration, setInitialDuration] = useState(initialSeconds);
  // Running: the moment the rest ends. The countdown is read from the clock, so it stays right
  // after iOS suspended the app in the background.
  const [endsAt, setEndsAt] = useState<number | null>(() => (autoStart ? Date.now() + initialSeconds * 1000 : null));
  // Paused or stopped: the seconds left
  const [pausedLeft, setPausedLeft] = useState(initialSeconds);
  const [now, setNow] = useState(() => Date.now());
  const [notifyPermission, setNotifyPermission] = useState(restNotificationsPermission);
  // The rest ran out on its own: its notification is going out, it must not be cancelled
  const endedOnItsOwn = useRef(false);

  const isRunning = endsAt !== null;
  const timeLeft = endsAt !== null ? Math.max(0, Math.ceil((endsAt - now) / 1000)) : pausedLeft;

  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => {
      const current = Date.now();
      setNow(current);
      if (current >= endsAt) {
        // No beep for a rest that ended while the app was in the background: the notification did it
        if (current - endsAt < 2000) playBeep();
        endedOnItsOwn.current = true;
        setEndsAt(null);
        setPausedLeft(0);
      }
    };
    const interval = setInterval(tick, 250);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [endsAt]);

  // The server notifies the phone when the rest ends, even with the app in the background or the screen locked
  useEffect(() => {
    if (endsAt === null) return;
    endedOnItsOwn.current = false;
    scheduleRestNotification(endsAt);
    return () => {
      if (!endedOnItsOwn.current) cancelRestNotification();
    };
  }, [endsAt]);

  useEffect(() => {
    syncRestNotifications();
  }, []);

  const runFor = (seconds: number) => {
    const current = Date.now();
    setNow(current);
    setEndsAt(current + seconds * 1000);
  };

  const startWith = (sec: number) => {
    setInitialDuration(sec);
    setPausedLeft(sec);
    runFor(sec);
    onDurationChange?.(sec);
  };

  const adjustTime = (sec: number) => {
    if (endsAt === null) {
      setPausedLeft((prev) => Math.max(0, prev + sec));
      return;
    }
    const current = Date.now();
    setNow(current);
    setEndsAt(Math.max(current, endsAt + sec * 1000));
  };

  const toggle = () => {
    if (isRunning) {
      setPausedLeft(timeLeft);
      setEndsAt(null);
    } else if (timeLeft === 0) {
      startWith(initialDuration);
    } else {
      runFor(timeLeft);
    }
  };

  const enableNotifications = async () => {
    const permission = await enableRestNotifications();
    setNotifyPermission(permission);
    // The rest already running gets its notification too
    if (permission === 'granted' && endsAt !== null) scheduleRestNotification(endsAt);
  };

  const isEnded = timeLeft === 0;
  const progressPercent = initialDuration > 0 ? Math.min(100, ((initialDuration - timeLeft) / initialDuration) * 100) : 0;
  const toggleLabel = isRunning ? 'Pause' : isEnded ? 'Relancer' : timeLeft === initialDuration ? 'Démarrer' : 'Reprendre';

  return (
    <section className={`rest-timer${isEnded ? ' is-ended' : ''}`} aria-label="Chronomètre de repos">
      <div className="rest-readout">
        <span className="rest-label">{isEnded ? 'Repos terminé' : isRunning || timeLeft !== initialDuration ? 'Repos' : 'Repos prêt'}</span>
        <span className="rest-time" role="timer" aria-live="off">
          {formatTime(timeLeft)}
        </span>
      </div>

      <div className="rest-progress">
        <div
          className="rest-track"
          role="progressbar"
          aria-label="Récupération"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPercent)}
        >
          <div className="rest-fill" style={{ width: `${progressPercent}%` }} />
        </div>
        <div className="rest-presets" role="group" aria-label="Durée du repos">
          {PRESETS.map((sec) => (
            <button
              key={sec}
              type="button"
              className={`rest-preset ${initialDuration === sec ? 'active' : ''}`}
              onClick={() => startWith(sec)}
              aria-pressed={initialDuration === sec}
            >
              {formatTime(sec)}
            </button>
          ))}
        </div>
      </div>

      <div className="rest-controls">
        <button type="button" className="rest-btn" onClick={() => adjustTime(-15)} aria-label="Retirer 15 secondes">
          -15s
        </button>
        <button type="button" className="rest-btn" onClick={() => adjustTime(30)} aria-label="Ajouter 30 secondes">
          +30s
        </button>
        <button type="button" className="rest-btn is-icon" onClick={toggle} aria-label={toggleLabel} title={toggleLabel}>
          <Icon name={isRunning ? 'pause' : 'play'} size={15} filled={!isRunning} strokeWidth={isRunning ? 2.4 : 1.5} />
        </button>
        {notifyPermission === 'default' && (
          <button
            type="button"
            className="rest-btn is-icon rest-notify"
            onClick={enableNotifications}
            aria-label="Être notifié à la fin du repos"
            title="Être notifié à la fin du repos, même écran verrouillé"
          >
            <Icon name="bell" size={15} />
          </button>
        )}
        {onClose && (
          <button type="button" className="rest-skip" onClick={onClose} aria-label="Passer le repos" title="Passer le repos">
            <span>Passer</span>
            <Icon name="skipNext" size={14} filled strokeWidth={1.5} />
          </button>
        )}
      </div>
    </section>
  );
};
