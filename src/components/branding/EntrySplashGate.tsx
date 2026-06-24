import React, { useEffect, useState } from 'react';
import LifeonRPGSplash from './LifeonRPGSplash';

/**
 * Mostra o splash "abrindo o portal" por `ms` ao montar, depois revela os filhos.
 * Os filhos montam por baixo (carregam dados durante o splash), e o overlay some no fim.
 * Usado pra dar o momento de transição ao entrar num portal/dungeon.
 */
export const EntrySplashGate: React.FC<{
  label?: string;
  ms?: number;
  children: React.ReactNode;
}> = ({ label = 'abrindo o portal', ms = 1600, children }) => {
  const [show, setShow] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setShow(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return (
    <>
      {children}
      {show && <LifeonRPGSplash fullscreen label={label} />}
    </>
  );
};

export default EntrySplashGate;
