import React, { useState, useEffect } from 'react';

interface RestTimerProps {
  onTimerEnd?: () => void;
  autoStartSeconds?: number | null;
  onClose?: () => void;
}

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

export const RestTimer: React.FC<RestTimerProps> = ({ autoStartSeconds, onClose }) => {
  const [initialDuration, setInitialDuration] = useState(90);
  const [timeLeft, setTimeLeft] = useState(90);
  const [isRunning, setIsRunning] = useState(false);

  useEffect(() => {
    if (autoStartSeconds && autoStartSeconds > 0) {
      setInitialDuration(autoStartSeconds);
      setTimeLeft(autoStartSeconds);
      setIsRunning(true);
    }
  }, [autoStartSeconds]);

  useEffect(() => {
    let interval: any = null;
    if (isRunning && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            playBeep();
            setIsRunning(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning, timeLeft]);

  const startWith = (sec: number) => {
    setInitialDuration(sec);
    setTimeLeft(sec);
    setIsRunning(true);
  };

  const adjustTime = (sec: number) => {
    setTimeLeft((prev) => Math.max(0, prev + sec));
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const progressPercent = initialDuration > 0 ? ((initialDuration - timeLeft) / initialDuration) * 100 : 0;

  return (
    <div className="rest-timer-bar glass-panel">
      <div className="timer-header flex-between">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.25rem' }}>⏱️</span>
          <strong>Chronomètre de repos</strong>
        </div>
        {onClose && (
          <button className="btn-icon" onClick={onClose} title="Masquer le timer">
            ✕
          </button>
        )}
      </div>

      <div className="timer-display flex-between" style={{ margin: '0.75rem 0' }}>
        <div className={`timer-clock ${timeLeft === 0 ? 'timer-ended' : ''}`}>
          {formatTime(timeLeft)}
        </div>
        <div className="timer-controls">
          <button className="btn-small" onClick={() => adjustTime(-15)}>-15s</button>
          <button 
            className={`btn-small ${isRunning ? 'btn-active' : ''}`}
            onClick={() => setIsRunning(!isRunning)}
          >
            {isRunning ? 'Pause' : timeLeft === 0 ? 'Relancer' : 'Démarrer'}
          </button>
          <button className="btn-small" onClick={() => adjustTime(+15)}>+15s</button>
          <button className="btn-small btn-danger" onClick={() => { setIsRunning(false); setTimeLeft(initialDuration); }}>
            Reset
          </button>
        </div>
      </div>

      <div className="timer-progress-track">
        <div 
          className="timer-progress-bar" 
          style={{ width: `${Math.min(100, progressPercent)}%` }} 
        />
      </div>

      <div className="timer-presets">
        {[30, 60, 90, 120, 180].map((sec) => (
          <button
            key={sec}
            className={`preset-btn ${initialDuration === sec ? 'active' : ''}`}
            onClick={() => startWith(sec)}
          >
            {sec >= 60 ? `${sec / 60}m` : `${sec}s`}
          </button>
        ))}
      </div>
    </div>
  );
};
