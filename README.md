# 🏋️ Overloady (OverloadTrack)

> Application web moderne de suivi d'entraînement et de surcharge progressive (*Progressive Overload*).

---

## 📌 Sommaire

- [Aperçu de la Stack](#-stack-technique)
- [Structure du Projet](#-structure-du-projet)
- [Prérequis](#-prérequis)
- [Démarrage Rapide (TL;DR)](#-démarrage-rapide-tldr)
- [Guide d'Installation & Lancement](#-guide-dinstallation--lancement-pas-à-pas)
  - [1. Base de données (PostgreSQL & Docker)](#1-lancer-la-base-de-données-postgresql-via-docker)
  - [2. Backend (NestJS & Prisma)](#2-configurer-et-lancer-le-backend)
  - [3. Frontend (React & Vite)](#3-configurer-et-lancer-le-frontend)
- [URLs de l'Application](#-urls-de-lapplication)
- [Fonctionnalités](#-fonctionnalités)
- [Scripts Utiles](#-scripts-utiles)
- [Dépannage & FAQ](#-dépannage--faq)

---

## 🛠 Stack Technique

- **Frontend** : [React 19](https://react.dev/), [TypeScript](https://www.typescriptlang.org/), [Vite](https://vitejs.dev/), [Axios](https://axios-http.com/)
- **Backend** : [NestJS](https://nestjs.com/), [TypeScript](https://www.typescriptlang.org/), [Prisma ORM](https://www.prisma.io/), [Passport / JWT](http://www.passportjs.org/)
- **Base de données** : [PostgreSQL 15](https://www.postgresql.org/) (via Docker)
- **Outils** : Docker Compose, ESLint / Oxlint

---

## 📂 Structure du Projet

```text
Overloady/
├── README.md                     # Documentation racine
└── OverloadTrack/
    ├── backend/                  # API NestJS + Prisma ORM
    │   ├── docker-compose.yml    # Conteneur PostgreSQL
    │   ├── .env                  # Variables d'environnement backend
    │   ├── prisma/
    │   │   └── seed.ts           # Données initiales (exercices par défaut)
    │   ├── src/
    │   │   ├── prisma/           # Schéma Prisma & Service de connexion
    │   │   ├── auth/             # Authentification (JWT, Login, Register)
    │   │   ├── user/             # Gestion utilisateur et profil
    │   │   ├── exercise/         # Gestion des exercices
    │   │   ├── workout/          # Séances, séries, répétitions, RPE
    │   │   └── main.ts           # Point d'entrée serveur (Port 3000)
    │   └── package.json
    │
    └── frontend/                 # Application Client React + Vite
        ├── src/
        │   ├── api.ts            # Client Axios configuré avec intercepteur JWT
        │   ├── App.tsx           # Interface principale & logique UI
        │   ├── App.css           # Styles spécifiques
        │   └── main.tsx          # Point d'entrée React
        ├── vite.config.ts        # Configuration Vite
        └── package.json
```

---

## ⚙️ Prérequis

Assurez-vous d'avoir installé sur votre machine :
- [Node.js](https://nodejs.org/) (version **18.x** ou supérieure recommandée)
- [npm](https://www.npmjs.com/) (fourni avec Node.js)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (nécessaire pour la base de données PostgreSQL)

---

## ⚡ Démarrage Rapide (TL;DR)

Ouvrez **deux terminaux** depuis la racine du projet :

### Terminal 1 — Backend & Base de données :
```bash
# 1. Se rendre dans le backend
cd OverloadTrack/backend

# 2. Démarrer PostgreSQL avec Docker
docker compose up -d

# 3. Installer les dépendances
npm install

# 4. Initialiser la base de données et les exercices de base
npx prisma generate --schema=src/prisma/schema.prisma
npx prisma db push --schema=src/prisma/schema.prisma
npx ts-node prisma/seed.ts

# 5. Démarrer le serveur NestJS
npm run start:dev
```

### Terminal 2 — Frontend :
```bash
# 1. Se rendre dans le frontend
cd OverloadTrack/frontend

# 2. Installer les dépendances
npm install

# 3. Démarrer le serveur de développement Vite
npm run dev
```

L'application est disponible sur : **http://localhost:5173**

---

## 📖 Guide d'Installation & Lancement Pas à Pas

### 1. Lancer la Base de Données (PostgreSQL via Docker)

Le backend utilise une base de données PostgreSQL conteneurisée.

1. Rendez-vous dans le dossier backend :
   ```bash
   cd OverloadTrack/backend
   ```

2. Démarrez le conteneur Docker :
   ```bash
   docker compose up -d
   ```
   *(Ou `docker-compose up -d` selon votre version de Docker).*

3. Vérifiez que le conteneur tourne correctement :
   ```bash
   docker ps
   ```
   Vous devriez voir le conteneur `overload_track_db` actif sur le port `5432`.

---

### 2. Configurer et Lancer le Backend

1. **Variables d'environnement** :
   Vérifiez la présence du fichier `.env` dans `OverloadTrack/backend/` :
   ```env
   DATABASE_URL="postgresql://root:rootpassword@localhost:5432/overload_track?schema=public"
   ```

2. **Installer les dépendances** :
   ```bash
   npm install
   ```

3. **Générer le client Prisma** :
   ```bash
   npx prisma generate --schema=src/prisma/schema.prisma
   ```

4. **Créer / synchroniser les tables dans PostgreSQL** :
   ```bash
   npx prisma db push --schema=src/prisma/schema.prisma
   ```

5. *(Recommandé)* **Peupler la base de données avec des exercices de base** :
   ```bash
   npx ts-node prisma/seed.ts
   ```
   *Cela insère automatiquement 10 exercices courants (Bench Press, Squat, Deadlift, Pull-up, etc.).*

6. **Lancer le serveur NestJS en mode développement** :
   ```bash
   npm run start:dev
   ```
   Le backend démarre sur **http://localhost:3000**.

---

### 3. Configurer et Lancer le Frontend

Ouvrez un nouveau terminal :

1. Rendez-vous dans le dossier frontend :
   ```bash
   cd OverloadTrack/frontend
   ```

2. Installez les dépendances :
   ```bash
   npm install
   ```

3. Lancez le serveur de développement Vite :
   ```bash
   npm run dev
   ```

4. Ouvrez votre navigateur sur l'adresse indiquée (par défaut : **http://localhost:5173**).

---

## 🌐 URLs de l'Application

| Service | URL | Description |
| :--- | :--- | :--- |
| **Frontend** | [http://localhost:5173](http://localhost:5173) | Interface utilisateur React |
| **Backend API** | [http://localhost:3000](http://localhost:3000) | Serveur d'API NestJS |
| **PostgreSQL** | `localhost:5432` | Base de données (`root` / `rootpassword`) |

---

## ✨ Fonctionnalités Majeures

- 🔐 **Authentification Sécurisée** : Inscription et connexion avec JSON Web Token (JWT) et validation préventive des doublons d'email.
- 🎯 **Surcharge Progressive Automatique** : Calcul et recommandation dynamique de la charge et des répétitions pour la prochaine séance (+2.5 kg ou +1 rep) basé sur les performances passées.
- ⏱️ **Séance d'Entraînement en Direct** :
  - Chronomètre de durée d'entraînement en temps réel.
  - Saisie intuitive des charges (kg) et des répétitions pour chaque série.
  - Bouton de validation rapide (✓) par série.
  - Évaluation de l'effort perçu (**RPE** de 1 à 10) et zone de notes de séance.
  - Enregistrement complet et persistant en base de données.
- ⏳ **Chronomètre de Repos Interactif (Rest Timer)** :
  - Compte à rebours personnalisable (30s, 60s, 90s, 120s, 180s) avec ajustement +/-15s.
  - Déclenchement automatique configurable dès qu'une série est validée (✓).
  - Alerte sonore (bip audio synthétisé via Web Audio API) et visuelle à la fin du repos.
- 📋 **Gestionnaire de Programmes & Routines** :
  - Création de programmes d'entraînement personnalisés (ex: Push, Pull, Legs, Full Body).
  - Sélecteur multiple d'exercices avec recherche intégrée.
  - Lancement en 1 clic : pré-remplissage automatique des exercices et des charges progressives calculées.
- 🧮 **Calculatrices Gym Intégrées** :
  - **Estimation 1RM (One Rep Max)** : Calcul selon la formule Epley et tableau complet des charges de travail (100%, 95%, 90%, 85%, 80%, 75%, 70%).
  - **Calculateur de Disques (Plate Calculator)** : Décomposition visuelle optimale des disques olympiques (25, 20, 15, 10, 5, 2.5, 1.25 kg) à charger de chaque côté de la barre.
- 💪 **Bibliothèque d'Exercices Complète & Personnalisable** :
  - Recherche textuelle instantanée et filtre par groupe musculaire (Pectoraux, Dos, Jambes, Épaules, Bras, Abdominaux...).
  - Création d'exercices personnalisés.
  - Fiche détaillée pour chaque exercice : Record personnel (PR), 1RM estimé et historique des charges.
- 📊 **Tableau de Bord & Historique Analytique** :
  - Séances de la semaine, volume total soulevé (kg), suivi du poids corporel et calcul automatique de l'IMC.
  - Historique détaillé dépliable pour inspecter chaque série et charge réalisée.
  - Suppression possible de séances et de routines.

---

## 📜 Scripts Utiles

### Backend (`OverloadTrack/backend/`)
- `npm run start:dev` : Lance l'API avec rechargement à chaud (*hot-reload*).
- `npm run build` : Compile le projet TypeScript pour la production dans le dossier `dist/`.
- `npm run start:prod` : Démarre le serveur compilé en mode production.
- `npx prisma studio --schema=src/prisma/schema.prisma` : Ouvre une interface web interactive pour visualiser et manipuler les données PostgreSQL.

### Frontend (`OverloadTrack/frontend/`)
- `npm run dev` : Lance le serveur de développement Vite.
- `npm run build` : Compile le frontend pour la production (TypeScript + Vite bundle).
- `npm run preview` : Prévisualise le build de production en local.
- `npm run lint` : Vérifie le code avec Oxlint.

---

## 🔧 Dépannage & FAQ

<details>
<summary><b>1. Erreur de connexion à la base de données (PrismaClientInitializationError)</b></summary>

- Assurez-vous que Docker Desktop est bien démarré.
- Vérifiez que le conteneur est en cours d'exécution :
  ```bash
  docker ps
  ```
- Si le conteneur est arrêté :
  ```bash
  cd OverloadTrack/backend
  docker compose up -d
  ```
</details>

<details>
<summary><b>2. Erreur : Cannot find module '@prisma/client' ou types introuvables</b></summary>

Régénérez le client Prisma :
```bash
cd OverloadTrack/backend
npx prisma generate --schema=src/prisma/schema.prisma
```
</details>

<details>
<summary><b>3. Le port 3000 ou 5432 est déjà utilisé</b></summary>

- Si le port `5432` est occupé par une instance locale de PostgreSQL déjà installée, arrêtez votre service PostgreSQL local ou modifiez le mappage des ports dans `docker-compose.yml` (ex: `"5433:5432"`) ainsi que dans le fichier `.env`.
- Si le port `3000` est occupé, vous pouvez tuer le processus occupant ou modifier le port dans `src/main.ts`.
</details>

<details>
<summary><b>4. Réinitialiser complètement la base de données</b></summary>

Si vous souhaitez remettre la base de données à zéro :
```bash
cd OverloadTrack/backend
docker compose down -v
docker compose up -d
npx prisma db push --schema=src/prisma/schema.prisma
npx ts-node prisma/seed.ts
```
</details>

---

*Développé pour optimiser vos performances et suivre votre surcharge progressive.* 💪
