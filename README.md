# Formation Offre Lab — Inscriptions (15 & 16 octobre)

Plateforme d'inscription partagée aux créneaux de formation à l'offre du Lab
(Agentic Livepoint). Tout le monde peut s'inscrire en même temps depuis
n'importe quel appareil ; chaque créneau se bloque automatiquement à 20
places, contrôlé côté serveur.

## Fonctionnement

- **Frontend** statique (`public/`) : formulaire d'inscription par créneau,
  capacité en temps réel (rafraîchie toutes les 4 secondes).
- **Backend** minimal en Express (`server.js`) qui stocke les inscriptions
  dans `data/registrations.json` et applique la limite de 20 côté serveur
  (donc fiable même en cas d'inscriptions simultanées).
- **Mode pilotage** : bouton en bas de page protégé par un code
  (variable d'environnement `PILOTAGE_CODE`, `PILOTAGE` par défaut) donnant
  accès à la liste complète, à la suppression d'une inscription et à
  l'export CSV. Le code est vérifié **côté serveur** à chaque appel — ce
  n'est pas juste un masque visuel.

## Lancer en local

```bash
npm install
npm start
```

Puis ouvrir http://localhost:3000

Pour changer le code pilotage :

```bash
PILOTAGE_CODE="monsupercode" npm start
```

## Déployer

Ce projet est un simple serveur Node/Express : il se déploie tel quel sur
n'importe quelle plateforme qui exécute du Node (Render, Railway, Fly.io,
un VPS classique...).

1. Pousser ce dossier sur un repo GitHub.
2. Connecter le repo à la plateforme choisie (build command : `npm install`,
   start command : `npm start`).
3. Définir la variable d'environnement `PILOTAGE_CODE` dans les réglages du
   service.
4. Vérifier que le disque contenant `data/registrations.json` est
   **persistant** (voir ci-dessous).

### ⚠️ Important : persistance des données

Le stockage utilisé ici est un simple fichier JSON sur disque — volontairement
simple pour rester lisible et facile à auditer. Certaines plateformes
gratuites (Render free, par exemple) réinitialisent le système de fichiers à
chaque redéploiement ou redémarrage du service : les inscriptions seraient
alors perdues.

- Sur Render/Railway : activer un **disque persistant** (Persistent Disk /
  Volume) monté sur le dossier `data/`.
- Alternative plus robuste pour un usage réel à moyen terme : remplacer les
  fonctions `readAll`/`writeAll` de `server.js` par un vrai stockage
  (Postgres via Supabase/Neon, ou Turso/SQLite distant) — la surface de code
  à changer est volontairement réduite à ces deux fonctions.

Pour un événement ponctuel de deux jours avec ~80 inscriptions maximum, le
fichier JSON est largement suffisant tant que le disque est persistant.

## Structure

```
.
├── package.json
├── server.js          # API + service des fichiers statiques
├── data/              # créé automatiquement au premier lancement
└── public/
    ├── index.html      # page d'inscription
    └── app.js          # logique front (fetch + polling)
```
