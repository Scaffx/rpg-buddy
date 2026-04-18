import { createContext, useContext, useState, ReactNode, useEffect } from 'react';

type ShortRestStatusContextType = {
  isResting: boolean;
  setIsResting: (value: boolean) => void;
  restMinutesRemaining: number;
};

const ShortRestStatusContext = createContext<ShortRestStatusContextType | undefined>(undefined);

export function ShortRestStatusProvider({ children }: { children: ReactNode }) {
  const [isResting, setIsResting] = useState(false);
  const [restMinutesRemaining, setRestMinutesRemaining] = useState(0);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const checkRestStatus = () => {
      const userId = localStorage.getItem('auth_user_id');
      if (!userId) return;
      
      const savedRest = localStorage.getItem(`short_rest_${userId}`);
      if (!savedRest) {
        setIsResting(false);
        return;
      }

      try {
        const parsed = JSON.parse(savedRest);
        const isRunning = Boolean(parsed.isRunning);
        const endAtMs = parsed.endAtMs;
        
        if (isRunning && endAtMs) {
          const remaining = Math.max(0, (endAtMs - Date.now()) / 1000);
          if (remaining > 0) {
            setIsResting(true);
            setRestMinutesRemaining(Math.ceil(remaining / 60));
          } else {
            setIsResting(false);
          }
        } else {
          setIsResting(false);
        }
      } catch {
        setIsResting(false);
      }
    };

    checkRestStatus();
    const interval = setInterval(checkRestStatus, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <ShortRestStatusContext.Provider value={{ isResting, setIsResting, restMinutesRemaining }}>
      {children}
    </ShortRestStatusContext.Provider>
  );
}

export function useShortRestStatus() {
  const context = useContext(ShortRestStatusContext);
  if (!context) {
    throw new Error('useShortRestStatus must be used within ShortRestStatusProvider');
  }
  return context;
}
