// Syntactic JWT fixtures only. Tests mock getUser(token), which supplies remote confirmation.
const defaultExpiry = Math.floor(Date.now() / 1000) + 3600;
const encode = (value: Record<string, unknown>) =>
  btoa(JSON.stringify(value)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');

export function authJwt(
  sub: string,
  { exp = defaultExpiry, iss = 'https://project.example.test/auth/v1', sessionId = 'session-a' }:
    { exp?: number | null; iss?: string; sessionId?: string } = {},
) {
  const claims: Record<string, unknown> = { sub, iss, session_id: sessionId };
  if (exp !== null) claims.exp = exp;
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(claims)}.synthetic-signature`;
}
