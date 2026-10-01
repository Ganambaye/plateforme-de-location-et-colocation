// Tanal Sa Logement — API Vercel (Edge Function).
//
// Une seule fonction api/index.mjs reçoit TOUTES les requêtes /api/* :
// la réécriture "/api/(.*) -> /api/index" dans vercel.json y envoie les
// chemins à plusieurs segments (/api/admin/stats, /api/annonces/mes…),
// et la fonction voit toujours l'URL d'origine. Le routeur partagé
// functions/handler.mjs — déjà en production sur l'hébergement Qoder —
// ancre ses routes sur la FIN du chemin (/annonces, /admin/stats…),
// donc le préfixe /api fonctionne sans autre adaptation.
//
// À configurer dans Vercel → Settings → Environment Variables :
//   SUPABASE_URL      : URL du projet Supabase (https://xxxx.supabase.co)
//   SUPABASE_ANON_KEY : clé publique « anon » du projet Supabase
import { createClient } from '@supabase/supabase-js';
import { handleApp } from '../functions/handler.mjs';

export const config = { runtime: 'edge' };

export default async function handler(request) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return Response.json({
      error: "Configuration manquante : ajoutez SUPABASE_URL et SUPABASE_ANON_KEY dans les variables d'environnement du projet Vercel."
    }, { status: 500, headers: { 'cache-control': 'no-store' } });
  }
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
  return handleApp({ request, supabase });
}
