import { useRef, useState, useEffect, useCallback } from 'react';
import { Play, Pause } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  src: string;
  direction: string;
}

const formatTime = (seconds: number) => {
  if (!isFinite(seconds) || seconds < 0) return '0:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

const SPEEDS = [1, 1.5, 2];

export const AudioPlayer = ({ src, direction }: AudioPlayerProps) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);

  const isOutgoing = direction === 'outgoing';

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  }, [isPlaying]);

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio) return;
    const val = parseFloat(e.target.value);
    audio.currentTime = val;
    setCurrentTime(val);
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(playbackRate);
    const next = SPEEDS[(idx + 1) % SPEEDS.length];
    setPlaybackRate(next);
    if (audioRef.current) audioRef.current.playbackRate = next;
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onMeta = () => setDuration(audio.duration);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onEnd = () => { setIsPlaying(false); setCurrentTime(0); };

    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('ended', onEnd);
    return () => {
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('ended', onEnd);
    };
  }, []);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="flex items-center gap-2 min-w-[220px] w-full max-w-[320px] py-1">
      <audio ref={audioRef} src={src} preload="metadata" />

      <button
        onClick={togglePlay}
        className={cn(
          'flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors',
          isOutgoing
            ? 'bg-emerald-500/30 hover:bg-emerald-500/50 text-emerald-300'
            : 'bg-primary/20 hover:bg-primary/30 text-primary'
        )}
      >
        {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
      </button>

      <div className="flex-1 flex flex-col gap-0.5 min-w-0">
        <div className="relative h-1.5 rounded-full bg-muted-foreground/20 overflow-hidden">
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-[width] duration-100',
              isOutgoing ? 'bg-emerald-400' : 'bg-primary'
            )}
            style={{ width: `${progress}%` }}
          />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={currentTime}
            onChange={handleSeek}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />
        </div>
        <div className="flex justify-between text-[10px] text-muted-foreground">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <button
        onClick={cycleSpeed}
        className={cn(
          'flex-shrink-0 text-[10px] font-bold rounded-md px-1.5 py-0.5 transition-colors',
          isOutgoing
            ? 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300'
            : 'bg-primary/15 hover:bg-primary/25 text-primary'
        )}
      >
        {playbackRate}x
      </button>
    </div>
  );
};
