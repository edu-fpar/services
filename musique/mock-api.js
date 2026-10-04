/**
 * mock-api.js — Faux serveur d'API pour le projet "musique"
 * ------------------------------------------------------------------
 * Ce script intercepte window.fetch pour simuler une API REST.
 * Il doit être chargé AVANT tout script qui utilise fetch.
 *
 * Usage :
 *   <script src="https://edu-fpar.github.io/services/musique/mock-api.js"></script>
 *   <script>  votre code  </script>
 *
 * Documentation complète : https://edu-fpar.github.io/services/musique/
 */

(function () {
  "use strict";

  // ------------------------------------------------------------------
  // 1. Configuration
  // ------------------------------------------------------------------
  const BASE_PATH = "/services/musique/";
  const DATA_URL = BASE_PATH + "data/";
  const IMG_URL = BASE_PATH + "images/";

  // Clés API et permissions associées
  const CLES = {
    "demo_free_0001": { compte: "free", peutVoirChansons: true, admin: false },
    "demo_pro_0002": { compte: "pro", peutVoirChansons: true, admin: false },
    "demo_admin_0003": { compte: "admin", peutVoirChansons: true, admin: true }
  };

  // Champs retirés pour le compte Free
  const CHAMPS_PRO_CHANTEUR = ["vraiNom", "dateNaissance", "bio"];
  const CHAMPS_PRO_ALBUM = ["label", "nombrePistes", "producteur", "dureeTotale"];
  const CHAMPS_PRO_CHANSON = ["auteur", "bpm", "tonalite"];
  const CHAMPS_PRO_LYRIC = ["langue", "auteurParoles", "anneeCopyright"];

  // ------------------------------------------------------------------
  // 2. Chargement initial des données (une seule fois)
  // ------------------------------------------------------------------
  const DB = {};
  const ready = (async () => {
    const fichiers = ["chanteurs", "albums", "chansons", "lyrics", "stats"];
    await Promise.all(
      fichiers.map(async (nom) => {
        const res = await window.__originalFetch(DATA_URL + nom + ".json");
        if (!res.ok) throw new Error("Impossible de charger " + nom + ".json");
        DB[nom] = await res.json();
      })
    );
    console.log("[mock-api] Données chargées :", Object.keys(DB));
  })();

  // ------------------------------------------------------------------
  // 3. Utilitaires
  // ------------------------------------------------------------------
  function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data), {
      status,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }

  function erreur(status, message) {
    return jsonResponse({ error: message }, status);
  }

  function extraireCle(init) {
    const headers = new Headers((init && init.headers) || {});
    const auth = headers.get("Authorization") || "";
    if (auth.startsWith("Bearer ")) return auth.slice(7).trim();
    return headers.get("X-API-Key") || null;
  }

  // Retire les champs Pro si le compte est "free"
  function filtrer(objet, champsPro, compte) {
    if (compte !== "free") return objet;
    const copie = { ...objet };
    champsPro.forEach((champ) => delete copie[champ]);
    return copie;
  }

  function filtrerListe(liste, champsPro, compte) {
    return liste.map((item) => filtrer(item, champsPro, compte));
  }

  // ------------------------------------------------------------------
  // 4. Interception de fetch
  // ------------------------------------------------------------------
  const originalFetch = window.fetch.bind(window);
  window.__originalFetch = originalFetch;

  window.fetch = async function (input, init) {
    const urlString = typeof input === "string" ? input : input.url;
    const url = new URL(urlString, location.origin);

    // Laisser passer tout ce qui n'est pas /api/
    if (!url.pathname.startsWith("/api/")) {
      return originalFetch(input, init);
    }

    // Attendre que les données soient chargées
    await ready;

    const method = (init && init.method) || "GET";

    // ----------------------------------------------------------------
    // 4.1 Authentification
    // ----------------------------------------------------------------
    const cle = extraireCle(init);
    if (!cle) return erreur(401, "Clé API manquante. Ajoutez l'en-tête Authorization: Bearer <clé>.");
    const compte = CLES[cle];
    if (!compte) return erreur(401, "Clé API invalide.");

    // ----------------------------------------------------------------
    // 4.2 Routes
    // ----------------------------------------------------------------

    // GET /api/chanteurs?q=...
    if (url.pathname === "/api/chanteurs" && method === "GET") {
      const q = (url.searchParams.get("q") || "").toLowerCase();
      const resultats = DB.chanteurs.filter((c) =>
        c.nom.toLowerCase().startsWith(q)
      );
      return jsonResponse(filtrerListe(resultats, CHAMPS_PRO_CHANTEUR, compte.compte));
    }

    // GET /api/chanteurs/:id
    const matchChanteur = url.pathname.match(/^\/api\/chanteurs\/(\d+)$/);
    if (matchChanteur && method === "GET") {
      const id = parseInt(matchChanteur[1], 10);
      const chanteur = DB.chanteurs.find((c) => c.id === id);
      if (!chanteur) return erreur(404, "Chanteur introuvable.");
      return jsonResponse(filtrer(chanteur, CHAMPS_PRO_CHANTEUR, compte.compte));
    }

    // GET /api/albums?chanteurId=...
    if (url.pathname === "/api/albums" && method === "GET") {
      const chanteurId = url.searchParams.get("chanteurId");
      let resultats = DB.albums;
      if (chanteurId) {
        const id = parseInt(chanteurId, 10);
        resultats = resultats.filter((a) => a.chanteurId === id);
      }
      return jsonResponse(filtrerListe(resultats, CHAMPS_PRO_ALBUM, compte.compte));
    }

    // GET /api/albums/:id
    const matchAlbum = url.pathname.match(/^\/api\/albums\/(\d+)$/);
    if (matchAlbum && method === "GET") {
      const id = parseInt(matchAlbum[1], 10);
      const album = DB.albums.find((a) => a.id === id);
      if (!album) return erreur(404, "Album introuvable.");
      return jsonResponse(filtrer(album, CHAMPS_PRO_ALBUM, compte.compte));
    }

    // GET /api/chansons?albumId=...&chanteurId=...
    if (url.pathname === "/api/chansons" && method === "GET") {
      const albumId = url.searchParams.get("albumId");
      const chanteurId = url.searchParams.get("chanteurId");
      let resultats = DB.chansons;

      if (albumId) {
        const id = parseInt(albumId, 10);
        resultats = resultats.filter((c) => c.albumId === id);
      }

      // Jointure : chansons d'un chanteur via ses albums
      if (chanteurId) {
        const id = parseInt(chanteurId, 10);
        const albumsDuChanteur = DB.albums
          .filter((a) => a.chanteurId === id)
          .map((a) => a.id);
        resultats = resultats.filter((c) => albumsDuChanteur.includes(c.albumId));
      }

      return jsonResponse(filtrerListe(resultats, CHAMPS_PRO_CHANSON, compte.compte));
    }

    // GET /api/chansons/:id
    const matchChanson = url.pathname.match(/^\/api\/chansons\/(\d+)$/);
    if (matchChanson && method === "GET") {
      const id = parseInt(matchChanson[1], 10);
      const chanson = DB.chansons.find((c) => c.id === id);
      if (!chanson) return erreur(404, "Chanson introuvable.");
      return jsonResponse(filtrer(chanson, CHAMPS_PRO_CHANSON, compte.compte));
    }

    // GET /api/lyrics?chansonId=...
    if (url.pathname === "/api/lyrics" && method === "GET") {
      const chansonId = url.searchParams.get("chansonId");
      if (!chansonId) return erreur(400, "Paramètre chansonId requis.");
      const id = parseInt(chansonId, 10);
      const lyrics = DB.lyrics.find((l) => l.chansonId === id);
      if (!lyrics) return erreur(404, "Paroles introuvables.");
      return jsonResponse(filtrer(lyrics, CHAMPS_PRO_LYRIC, compte.compte));
    }

    // GET /api/stats (admin uniquement)
    if (url.pathname === "/api/stats" && method === "GET") {
      if (!compte.admin) return erreur(403, "Réservé aux administrateurs.");
      return jsonResponse(DB.stats);
    }

    // ----------------------------------------------------------------
    // 4.3 Route inconnue
    // ----------------------------------------------------------------
    return erreur(404, "Route inconnue : " + url.pathname);
  };

  console.log("[mock-api] Faux serveur initialisé. Base : /api/");
})();
