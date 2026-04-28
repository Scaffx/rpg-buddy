import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Returns true when the current user has app_metadata.role === "admin".
 * Admin role must be set in Supabase Auth (Users → Edit user → app_metadata).
 */
export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const role = (data.user?.app_metadata as any)?.role;
      if (!cancelled) {
        setIsAdmin(role === "admin");
        setLoading(false);
      }
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const role = (session?.user?.app_metadata as any)?.role;
      setIsAdmin(role === "admin");
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { isAdmin, loading };
}
