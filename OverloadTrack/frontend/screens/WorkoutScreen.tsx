import React from 'react';
import { View, Text, Button, StyleSheet, Alert } from 'react-native';
import { startWorkout } from '../services/api';

// @ts-ignore
const WorkoutScreen = ({ navigation }) => {

  const handleStartWorkout = async () => {
    // ATTENTION: Ces valeurs sont en dur pour l'exemple.
    // Dans une vraie application, l'userId viendrait de l'état de l'utilisateur connecté
    // et le routineId de la routine sélectionnée par l'utilisateur.
    const MOCK_USER_ID = "clz3j3z1z000008l5g1j2h3k4"; // Remplacez par un ID utilisateur valide de votre BDD
    const MOCK_ROUTINE_ID = "clz3j4a1b000108l5d2e3f4g5"; // Remplacez par un ID de routine valide

    try {
      console.log("Tentative de démarrage de la séance...");
      const response = await startWorkout(MOCK_USER_ID, MOCK_ROUTINE_ID);
      const sessionData = response.data;

      console.log("Séance reçue du backend :", sessionData);

      // Naviguer vers l'écran de la séance en lui passant les données
      navigation.navigate('WorkoutSession', { sessionData });

    } catch (error) {
      console.error("Erreur lors du démarrage de la séance:", error);
      Alert.alert("Erreur", "Impossible de démarrer la séance. Vérifiez les logs et assurez-vous que le backend est bien démarré et que les IDs sont corrects.");
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Vos Entraînements</Text>
      <Button title="Démarrer une routine 'Push' (Test)" onPress={handleStartWorkout} />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 30,
  },
});

export default WorkoutScreen;
