import { PhoneIcon, SmartphoneIcon, VideoIcon, Volume2Icon, XIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';

const IncomingCallNotification = ({ isOpen, onAccept, onDecline, callerName, callerImage, callType = 'video', ringtoneVolume = 0.6, vibrate = true }) => {
  const [ringingTime, setRingingTime] = useState(0);
  const [canPlayAlert, setCanPlayAlert] = useState(true);
  const audioContextRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const hasUserActivation = Boolean(
      navigator.userActivation?.hasBeenActive || navigator.userActivation?.isActive
    );

    if (hasUserActivation) {
      setCanPlayAlert(true);
      return;
    }

    const enableAlerts = () => setCanPlayAlert(true);

    window.addEventListener('pointerdown', enableAlerts, { once: true, passive: true });
    window.addEventListener('keydown', enableAlerts, { once: true });

    return () => {
      window.removeEventListener('pointerdown', enableAlerts);
      window.removeEventListener('keydown', enableAlerts);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const playTone = () => {
      try {
        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextCtor) return;

        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContextCtor();
        }

        const ctx = audioContextRef.current;
        const now = ctx.currentTime;
        const safeVolume = Math.max(0, Math.min(1, ringtoneVolume));

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(Math.max(0.001, safeVolume * 0.3), now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
        gain.connect(ctx.destination);

        const oscillator = ctx.createOscillator();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, now);
        oscillator.frequency.linearRampToValueAtTime(660, now + 0.3);
        oscillator.connect(gain);
        oscillator.start(now);
        oscillator.stop(now + 0.5);

        if (vibrate && navigator.vibrate) {
          navigator.vibrate([180, 120, 180]);
        }
      } catch {
        // Ignore audio API failures caused by browser restrictions.
      }
    };

    playTone();
    const ringLoop = setInterval(playTone, 1800);

    const interval = setInterval(() => {
      setRingingTime(prev => prev + 1);
    }, 1000);

    return () => {
      clearInterval(ringLoop);
      clearInterval(interval);
      if (canPlayAlert && navigator.vibrate) navigator.vibrate(0);
      audioContextRef.current?.close?.();
      audioContextRef.current = null;
      setRingingTime(0);
    };
  }, [canPlayAlert, isOpen, ringtoneVolume, vibrate]);

  useEffect(() => {
    if (!isOpen) {
      setCanPlayAlert(true);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const callLabel = callType === 'video' ? 'Incoming video call' : 'Incoming voice call';

  return (
    <div className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-base-100 via-base-100 to-base-200 shadow-[0_24px_70px_rgba(0,0,0,0.45)] animate-in zoom-in duration-300">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(16,185,129,0.18),transparent_45%),radial-gradient(circle_at_80%_70%,rgba(59,130,246,0.15),transparent_40%)]" />
        <div className="relative px-7 pt-7 pb-6 text-center">
          <div className="mb-5 flex items-center justify-center gap-2">
            <span className="badge badge-success badge-sm font-semibold">Ringing</span>
            <span className="badge badge-outline badge-sm border-base-content/20 text-base-content/70">{ringingTime}s</span>
          </div>

          <div className="relative mx-auto mb-6 grid h-32 w-32 place-items-center">
            <div className="absolute inset-0 rounded-full bg-success/20 animate-ping" />
            <div className="absolute inset-1 rounded-full bg-primary/10 animate-pulse" />
            <div className="relative h-28 w-28 overflow-hidden rounded-full border-4 border-base-100 ring-4 ring-success/60 shadow-xl">
              <Avatar src={callerImage} name={callerName} size="w-28 h-28" className="block" />
            </div>
          </div>

          <h2 className="mb-1 text-3xl font-black tracking-tight text-base-content">
            {callerName}
          </h2>

          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-base-content/15 bg-base-100/70 px-3 py-1 text-sm font-medium text-base-content/75">
            {callType === 'video' ? <VideoIcon className="size-4" /> : <PhoneIcon className="size-4" />}
            <span>{callLabel}</span>
          </div>

          <div className="mb-7 flex flex-wrap items-center justify-center gap-2">
            <span className="badge badge-outline gap-1 border-base-content/20">
              <Volume2Icon className="size-3.5" />
              {Math.round(Math.max(0, Math.min(1, ringtoneVolume)) * 100)}% volume
            </span>
            <span className="badge badge-outline gap-1 border-base-content/20">
              <SmartphoneIcon className="size-3.5" />
              {vibrate ? (canPlayAlert ? 'Vibrate on' : 'Tap to enable alerts') : 'Vibrate off'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={onDecline}
              className="btn h-12 rounded-2xl border-error/30 bg-error/90 text-white shadow-lg hover:bg-error"
              title="Decline"
            >
              <XIcon className="size-5" />
              Decline
            </button>

            <button
              onClick={onAccept}
              className="btn h-12 rounded-2xl border-success/30 bg-success text-white shadow-lg hover:bg-success/90"
              title="Accept"
            >
              {callType === 'video' ? <VideoIcon className="size-5" /> : <PhoneIcon className="size-5" />}
              Accept
            </button>
          </div>

          <p className="mt-4 text-xs text-base-content/45">
            Your microphone and camera permissions may be requested after accept.
          </p>
        </div>
      </div>
    </div>
  );
};

export default IncomingCallNotification;
