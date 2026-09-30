# Inscription Vibecode

Page d'inscription moderne (Next.js) avec espace administrateur et limite stricte du nombre d'inscrits. **Aucune base de données** : les inscriptions sont de petits fichiers JSON stockés dans Vercel Blob.

## Fonctionnalités

**Public (`/`)**
- Formulaire : prénom, nom, e-mail, entreprise/équipe, message optionnel
- Compteur de places restantes mis à jour toutes les 5 s, passage automatique en « complet »
- Inscriptions simultanées sans limite de connexions, et **jamais plus de 20 inscrits** (voir ci-dessous)
- Un e-mail ne peut s'inscrire qu'une fois

**Admin (`/admin`, protégé par mot de passe)**
- Liste des inscrits, mise à jour toutes les 3 s (suivi en temps réel)
- Détail de chaque inscrit (nom, e-mail, entreprise, message, date)
- Suppression d'un inscrit (libère immédiatement une place)
- Inscrits / places restantes / capacité

## Comment ça marche sans base de données

Chaque place est un fichier `slots/001.json` … `slots/020.json`. Un fichier ne peut être créé que s'il n'existe pas déjà : deux personnes ne peuvent donc jamais prendre la même place, et le total ne peut pas dépasser `MAX_REGISTRATIONS`, même si 100 personnes s'inscrivent au même instant. Un fichier `emails/<hash>.json` empêche les doublons d'e-mail. Les fichiers sont privés (jamais accessibles par URL publique), seule l'application les lit.

## Configuration

Copier `.env.example` en `.env.local` :

| Variable | Rôle |
|---|---|
| `ADMIN_PASSWORD` | Mot de passe de `/admin` |
| `MAX_REGISTRATIONS` | Nombre max d'inscrits (défaut 20) |
| `BLOB_READ_WRITE_TOKEN` | Ajoutée automatiquement par Vercel avec un Blob store. En local, laisser vide : les données vont dans `.data/` |
| `NEXT_PUBLIC_EVENT_TITLE` / `NEXT_PUBLIC_EVENT_DATE` | Texte affiché sous le titre (optionnel) |

```bash
npm install
npm run dev
```

## Déploiement : GitHub + Vercel

1. **GitHub** : créer un dépôt vide, puis
   ```bash
   git remote add origin https://github.com/<compte>/vibecode-inscription.git
   git push -u origin main
   ```
2. **Vercel** : *Add New → Project*, importer le dépôt (ne pas encore déployer, ou redéployer après l'étape 3).
3. **Stockage** : dans le projet Vercel, onglet *Storage* → *Create* → **Blob**, en mode **Private**, puis le connecter au projet. `BLOB_READ_WRITE_TOKEN` est ajoutée automatiquement.
4. **Variables d'environnement** : ajouter `ADMIN_PASSWORD` (et éventuellement `MAX_REGISTRATIONS`, `NEXT_PUBLIC_EVENT_TITLE`, `NEXT_PUBLIC_EVENT_DATE`).
5. *Deploy*. Les données restent en place entre les déploiements.

Modifier la capacité : changer `MAX_REGISTRATIONS` puis redéployer.
