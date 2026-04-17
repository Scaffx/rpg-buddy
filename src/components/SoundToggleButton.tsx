import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { isMuted, subscribeMute, toggleMute } from '@/lib/sfx';

export default function SoundToggleButton() {
  const [muted, setMutedState] = useState<boolean>(() => isMuted());

  useEffect(() => subscribeMute(setMutedState), []);

  const handleClick = () => {
    const next = toggleMute();
    setMutedState(next);
  };

  return (
    <button
      onClick={handleClick}
      title={muted ? 'Ativar sons' : 'Desativar sons'}
      aria-label={muted ? 'Ativar sons' : 'Desativar sons'}
      className={`inline-flex items-center justify-center w-9 h-9 rounded-lg border transition ${
        muted
          ? 'border-muted bg-muted/40 text-muted-foreground hover:text-foreground'
          : 'border-primary/40 bg-primary/10 text-primary hover:bg-primary/20'
      }`}
    >
      {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
    </button>
  );
}
