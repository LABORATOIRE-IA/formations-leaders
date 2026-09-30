# Formation Offre Lab — Inscriptions (15 & 16 octobre)

Plateforme d'inscription partagée aux créneaux de formation à l'offre du Lab
(Agentic Livepoint). Tout le monde peut s'inscrire en même temps depuis
n'importe quel appareil ; chaque créneau se bloque automatiquement à 20
places, contrôlé côté serveur.

## Fonctionnement

- **Frontend** statique (`public/`) : formulaire d'inscription par créneau,
  capacité en temps réel (rafraîchie toutes les 4 secondes).
- **Backend** en Express (`server.js`) qui applique la limite de 20 côté
  serveur, de façon fiable même en cas d'inscriptions simultanées (testé
  avec 30 inscriptions envoyées en même temps : exactement 20 acceptées,
  10 refusées proprement).
- **Stockage** : deux modes, choisis automatiquement selon l'endroit où
  l'app tourne (voir plus bas — c'est le point important pour Vercel).
- **Mode pilotage** : bouton en bas de page protégé par un code
  (variable d'environnement `PILOTAGE_CODE`, `PILOTAGE` par défaut) donnant
  accès à la liste complète, à la suppression d'une inscription et à
  l'export CSV. Le code est vérifié **côté serveur** à chaque appel — ce
  n'est pas juste un masque visuel.

## ⚠️ Sur Vercel, une base de données est obligatoire

Vercel ne fait pas tourner un serveur permanent comme un serveur classique :
chaque requête démarre une petite fonction indépendante, sans disque
partagé entre les utilisateurs. Un simple fichier `data/registrations.json`
ne peut donc **pas** être partagé entre les inscriptions de plusieurs
personnes sur Vercel — c'est exactement ce qui empêchait le plafond de 20
de fonctionner correctement en production.

Ce projet a été modifié pour supporter un vrai stockage partagé : une base
Redis (via l'intégration **Upstash** du Vercel Marketplace, gratuite pour ce
volume d'usage). Tant que cette base n'est pas créée et reliée au projet,
Vercel utilisera un stockage fichier qui ne sera pas fiable en production —
il faut donc suivre les étapes ci-dessous **une seule fois**.

### Étapes à suivre dans le dashboard Vercel (5 minutes, une seule fois)

1. Ouvrir le projet `formations-leaders` sur [vercel.com](https://vercel.com).
2. Dans le menu du haut, cliquer sur l'onglet **Storage**.
3. Cliquer sur **Create Database** (ou **Browse Marketplace** selon
   l'interface), puis choisir **Upstash** → **Redis** (souvent proposé sous
   le nom "Upstash for Redis").
4. Choisir le plan gratuit ("Free" / "Hobby"), donner un nom (ex.
   `formations-leaders-db`), garder la région par défaut, valider la
   création.
5. Sur l'écran suivant, Vercel demande à quel(s) projet(s) relier cette
   base : cocher **formations-leaders**, puis confirmer ("Connect" /
   "Connect Project"). Cela ajoute automatiquement les variables
   d'environnement nécessaires (`KV_REST_API_URL`, `KV_REST_API_TOKEN` ou
   `UPSTASH_REDIS_REST_URL`/`TOKEN` selon la version de l'intégration) —
   il n'y a rien à recopier à la main.
6. Retourner dans l'onglet **Deployments** du projet, ouvrir le dernier
   déploiement et cliquer sur **Redeploy** (bouton "..." → "Redeploy") pour
   que le nouveau déploiement parte avec les variables de la base
   fraîchement reliée.
7. Une fois le redéploiement terminé, ouvrir
   `https://formations-leaders.vercel.app/api/health` : la réponse doit
   afficher `"storage":"kv"`. Si elle affiche `"storage":"file"`, la base
   n'est pas encore reliée ou le redéploiement n'a pas pris en compte les
   nouvelles variables — recommencer l'étape 6.

### Vérifier que ça bloque bien à 20

Une fois `"storage":"kv"` confirmé : faire inscrire (ou simuler) plusieurs
personnes sur le même créneau depuis des appareils/onglets différents. Au
21ᵉ inscrit sur un même créneau, le formulaire doit refuser avec le message
"Ce créneau est complet."

## Lancer en local (sans base de données)

```bash
npm install
npm start
```

Puis ouvrir http://localhost:3000

Sans les variables `KV_REST_API_URL`/`KV_REST_API_TOKEN` (ou
`UPSTASH_REDIS_REST_URL`/`TOKEN`) définies, l'app bascule automatiquement
sur un fichier local `data/registrations.json` — pratique pour tester,
mais **à ne pas utiliser tel quel en production sur Vercel**.

Pour changer le code pilotage :

```bash
PILOTAGE_CODE="monsupercode" npm start
```

## Déployer ailleurs qu'sur Vercel

Ce projet reste un serveur Node/Express classique (`server.js` exporte
l'app et l'écoute réseau ne démarre que si le fichier est exécuté
directement) : il se déploie donc tel quel sur toute plateforme qui exécute
du Node en continu (Render, Railway, Fly.io, un VPS...). Dans ce cas, soit
on relie les mêmes variables Redis (Upstash a une offre indépendante de
Vercel), soit on active un disque persistant pour `data/` si on préfère
garder le stockage fichier.

## Structure

```
.
├── package.json
├── vercel.json        # config de déploiement Vercel (routes tout vers server.js)
├── server.js           # API + service des fichiers statiques (Express)
├── store.js            # couche de stockage : Redis (Upstash/Vercel KV) ou fichier local
├── data/                # créé automatiquement en mode fichier (local uniquement)
└── public/
    ├── index.html      # page d'inscription
    └── app.js           # logique front (fetch + polling)
```
