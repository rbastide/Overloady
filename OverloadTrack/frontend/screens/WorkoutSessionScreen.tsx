import React from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';

// @ts-ignore
const WorkoutSessionScreen = ({ route }) => {
  // Les données de la séance sont passées via les paramètres de navigation
  const { sessionData } = route.params;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Détails de la Séance</Text>
      <View style={styles.jsonContainer}>
        {/* Affiche les données de la séance au format JSON pour le débogage */}
        <Text>{JSON.stringify(sessionData, null, 2)}</Text>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 10,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  jsonContainer: {
    backgroundColor: '#f0f0f0',
    padding: 10,
    borderRadius: 5,
  },
});

export default WorkoutSessionScreen;
