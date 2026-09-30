# Formation à l'offre du Lab — inscription par créneaux

Page d'inscription (Next.js) : jeudi 15 et vendredi 16 octobre, 2 créneaux par jour (14:00 → 14:45 et 14:45 → 15:30), 20 places par créneau. **Aucune base de données** : les inscriptions sont de petits fichiers JSON stockés dans Vercel Blob.

## Fonctionnement

**Public (`/`)**
- On clique sur un créneau, on renseigne prénom, nom, e-mail (entreprise optionnelle) : c'est inscrit.
- Chaque créneau affiche ses places restantes et une jauge ; passage en « complet » automatique.
- Une seule inscription par personne : une fois inscrit, les autres créneaux affichent « Déjà inscrit(e) à un autre créneau ». Le bouton « Annuler mon inscription » libère la place.
- L'inscription est mémorisée dans le navigateur de la personne (sur le même appareil). Si l'admin la supprime, l'affichage revient à zéro tout seul.
- Inscriptions simultanées sans limite de connexions, et **jamais plus de 20 inscrits par créneau**.

**Mode pilotage (`/admin`, mot de passe)**
- Inscrits par créneau, avec nom, e-mail, entreprise, date d'inscription
- Places restantes par créneau et au total, mises à jour toutes les 3 s
- Suppression d'un inscrit (libère immédiatement la place)

## Comment ça tient sans base de données

Chaque place est un fichier `seats/<créneau>/001.json` … `020.json`. Un fichier ne peut être créé que s'il n'existe pas déjà : deux personnes ne peuvent jamais prendre la même place, même si 100 personnes cliquent en même temps. Un fichier `emails/<hash>.json` limite chaque personne à une inscription. Les fichiers sont privés (aucune URL publique).

## Modifier les jours / horaires

Éditer `src/lib/slots.ts` (jours, dates, horaires, identifiants de créneaux).

## Configuration

| Variable | Rôle |
|---|---|
| `ADMIN_PASSWORD` | Mot de passe du mode pilotage |
| `SLOT_CAPACITY` | Places par créneau (défaut 20) |
| `BLOB_READ_WRITE_TOKEN` | Ajoutée automatiquement par Vercel avec un Blob store. En local, laisser vide : données dans `.data/` |

```bash
npm install
npm run dev
```

## Déploiement : GitHub + Vercel

1. Pousser le code sur GitHub.
2. Vercel : importer le dépôt, **Framework Preset = Next.js**.
3. Storage → créer un **Blob** store en mode **Private** et le connecter au projet.
4. Variables d'environnement : `ADMIN_PASSWORD` (et éventuellement `SLOT_CAPACITY`).
5. Déployer (ou *Redeploy* après l'étape 3).
