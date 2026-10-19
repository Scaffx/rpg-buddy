import type { Json } from '@/integrations/supabase/types';

export function requireRpcObject(value: Json | null, rpcName: string): Record<string, Json | undefined> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Resposta inválida de ${rpcName}.`);
  }
  return value;
}
