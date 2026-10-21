import { useAuth } from "./useAuth";

/**
 * Visual-only admin flag from the AuthProvider's confirmed user.
 * Backend authorization remains enforced by its own policies.
 */
export function useIsAdmin() {
  const { user, loading, authError } = useAuth();
  return {
    isAdmin: !loading && !authError && user?.app_metadata?.role === "admin",
    loading,
  };
}
