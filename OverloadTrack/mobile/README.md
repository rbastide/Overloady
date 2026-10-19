# 📱 Overloady Mobile (Expo Go)

Coque Expo qui ouvre l'app web Overloady dans une WebView, pour l'avoir en application sur le téléphone via **Expo Go**. Le frontend React/Vite tourne tel quel ; seul ce petit projet est en React Native.

Ce que la coque ajoute par rapport au navigateur :
- **Vibrations** des séries, records et fin de repos (patterns sur Android, retours haptiques sur iOS).
- **Écran allumé** pendant la séance (le `wakeLock` de l'app web est relayé au téléphone).
- **Copie du résumé** de séance dans le presse-papier, même en `http` local.
- **Bouton retour Android**, barre d'état sombre, écran d'erreur avec « Réessayer ».

## Prérequis

- Node.js 20+ (testé avec Node 24).
- L'app **Expo Go** installée sur le téléphone (App Store / Play Store), à jour : le projet est en SDK 57 (Expo Go → Settings → « Supported SDK »).
- Le téléphone et le PC sur le **même réseau Wi-Fi** (pour le mode local).

## Configuration

```bash
cd OverloadTrack/mobile
npm install
cp .env.example .env
```

Dans `.env`, `EXPO_PUBLIC_WEB_URL` est l'adresse que le téléphone ouvre :
- **Dev local** : `http://<IP-Wi-Fi-du-PC>:5173` (l'IP vient de `ipconfig`, carte Wi-Fi). Le frontend appelle alors le backend sur `http://<même IP>:3000` tout seul.
- **Site déployé** : `https://<ton-app>.vercel.app`.

Toute modification du `.env` demande de relancer Metro avec `npx expo start -c`.

## Lancer

Trois terminaux en mode local :

```bash
# 1. Backend (port 3000)
cd OverloadTrack/backend && npm run start:dev
# 2. Frontend (port 5173, déjà ouvert sur le réseau)
cd OverloadTrack/frontend && npm run dev
# 3. Coque Expo
cd OverloadTrack/mobile && npx expo start
```

Scanne le QR code : appareil photo sur iOS, Expo Go sur Android.

## Dépannage

- **Le QR code pointe vers la mauvaise IP** (VPN, VirtualBox, WSL) : `set REACT_NATIVE_PACKAGER_HOSTNAME=<IP-Wi-Fi>` (PowerShell : `$env:REACT_NATIVE_PACKAGER_HOSTNAME="<IP-Wi-Fi>"`) puis `npx expo start`.
- **« Overloady ne répond pas »** : ouvre l'URL du `.env` dans le navigateur du téléphone. Si ça échoue aussi, le pare-feu Windows bloque les ports 5173 / 3000 / 8081 (autoriser Node.js sur les réseaux privés).
- **Wi-Fi public ou isolé** (école, hôtel) : `npm run tunnel` fait passer Metro, mais pas Vite ni le backend. Pointe alors `EXPO_PUBLIC_WEB_URL` vers le site déployé.

## Limites connues

- Le **partage de l'image récap** (`navigator.share` avec fichier) et son téléchargement ne passent pas dans la WebView.
- Les **notifications push de fin de repos** reposent sur le service worker web : elles ne fonctionnent pas dans Expo Go.
- Expo Go sert au développement. Pour une vraie app installable sans Expo Go, il faudra un build EAS (`npx eas-cli@latest build`).
