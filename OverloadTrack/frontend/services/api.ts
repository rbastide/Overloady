import axios from 'axios';

// IMPORTANT: C'est l'adresse IP de votre VM Debian
// C'est l'adresse de votre serveur backend NestJS
const API_URL = 'http://192.168.1.33:3000';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const completeOnboarding = (data: {
  email: string;
  dateOfBirth: string; // Format YYYY-MM-DD
  height: number;
  weight: number;
}) => {
  return api.post('/user/onboarding', data);
};

export const startWorkout = (userId: string, routineId: string) => {
  return api.post('/workout/start', { userId, routineId });
};


// Ici, nous ajouterons d'autres fonctions pour interagir avec l'API
// comme finishWorkout, etc.

export default api;
