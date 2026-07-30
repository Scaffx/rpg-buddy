import { useCallback, useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Camera } from '@capacitor/camera';

/**
 * Permissões do aparelho: notificação e câmera.
 *
 * A notificação é pedida logo depois do login, quando a pessoa acabou de entrar
 * e o app já tem o que dizer. A câmera é pedida no mesmo momento porque as
 * medições corporais usam foto — mas negar não trava nada: quem recusar recebe
 * o pedido de novo na hora de tirar a foto, que é quando o motivo fica óbvio.
 *
 * No navegador não há o que pedir: os plugins do Capacitor só existem no app
 * nativo, e chamá-los na web lança exceção.
 */

export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unavailable';

const isNative = () => Capacitor.isNativePlatform();

function normalize(value: string | undefined): PermissionState {
  if (value === 'granted') return 'granted';
  if (value === 'denied') return 'denied';
  return 'prompt';
}

export function useAppPermissions() {
  const [notifications, setNotifications] = useState<PermissionState>('prompt');
  const [camera, setCamera] = useState<PermissionState>('prompt');
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const check = async () => {
      if (!isNative()) {
        if (!cancelled) {
          setNotifications('unavailable');
          setCamera('unavailable');
          setChecked(true);
        }
        return;
      }
      try {
        const n = await LocalNotifications.checkPermissions();
        if (!cancelled) setNotifications(normalize(n.display));
      } catch {
        if (!cancelled) setNotifications('unavailable');
      }
      try {
        const c = await Camera.checkPermissions();
        if (!cancelled) setCamera(normalize(c.camera));
      } catch {
        if (!cancelled) setCamera('unavailable');
      }
      if (!cancelled) setChecked(true);
    };

    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  const requestNotifications = useCallback(async (): Promise<PermissionState> => {
    if (!isNative()) return 'unavailable';
    try {
      const res = await LocalNotifications.requestPermissions();
      const state = normalize(res.display);
      setNotifications(state);
      return state;
    } catch {
      setNotifications('unavailable');
      return 'unavailable';
    }
  }, []);

  const requestCamera = useCallback(async (): Promise<PermissionState> => {
    if (!isNative()) return 'unavailable';
    try {
      const res = await Camera.requestPermissions({ permissions: ['camera', 'photos'] });
      const state = normalize(res.camera);
      setCamera(state);
      return state;
    } catch {
      setCamera('unavailable');
      return 'unavailable';
    }
  }, []);

  return {
    notifications,
    camera,
    checked,
    isNative: isNative(),
    requestNotifications,
    requestCamera,
  };
}
