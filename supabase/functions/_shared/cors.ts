// Orígens permesos per a les Edge Functions de micsas.ff.
// TODO: un cop el DNS de micsasff.com estigui propagat del tot i ja no calgui
// provar des de l'antic domini de Vercel, treu aquesta última línia.
const ALLOWED_ORIGINS = [
  "https://micsasff.com",
  "https://www.micsasff.com",
  "https://micsas-ff-web-11g9.vercel.app",
];

export function getCorsHeaders(origin: string | null) {
  const allowOrigin = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}
