/**
 * Sitio estático (`next build` → carpeta `out/`) para Cloudflare Pages. El
 * backend y la autenticación siguen en Convex; el navegador habla directo con
 * él, así que no hace falta servidor de Next.js.
 *
 * La URL de Convex queda fija dentro del JS al compilar. Sin ella el
 * prerender truena con un error poco claro dentro de `useConvexAuth()`, así
 * que se exige aquí. En Pages la inyecta `npx convex deploy --cmd 'npm run
 * build'`; en local sale de `.env.local`.
 */
if (!process.env.NEXT_PUBLIC_CONVEX_URL) {
  throw new Error(
    "Falta NEXT_PUBLIC_CONVEX_URL. Compila con `npx convex deploy --cmd 'npm run build'` o define la variable (local: .env.local).",
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
};

export default nextConfig;
