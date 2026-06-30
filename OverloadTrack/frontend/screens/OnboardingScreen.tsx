import React, { useState } from 'react';
import { View, Text, TextInput, Button, StyleSheet, Alert, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { completeOnboarding } from '../services/api';

// @ts-ignore
const OnboardingScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState(''); // Format JJ/MM/AAAA
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');

  const handleContinue = async () => {
    if (!email || !dateOfBirth || !height || !weight) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs.');
      return;
    }

    const parts = dateOfBirth.split('/');
    if (parts.length !== 3) {
      Alert.alert('Erreur', 'Veuillez entrer la date au format JJ/MM/AAAA.');
      return;
    }
    const formattedDate = `${parts[2]}-${parts[1]}-${parts[0]}`;

    try {
      await completeOnboarding({
        email,
        dateOfBirth: formattedDate,
        height: parseInt(height, 10),
        weight: parseFloat(weight),
      });
      
      Alert.alert('Succès', 'Votre profil a été créé !');
      navigation.navigate('Workout');

    } catch (error) {
      console.error(error);
      Alert.alert('Erreur', 'Une erreur est survenue lors de la création de votre profil.');
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView 
        behavior={Platform.OS === "ios" ? "padding" : "height"} 
        style={styles.container}
      >
        <Text style={styles.title}>Créez votre profil</Text>
        
        <Text style={styles.label}>Adresse Email</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: jean.dupont@email.com"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          autoCapitalize="none"
        />

        <Text style={styles.label}>Date de naissance (JJ/MM/AAAA)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 25/12/1990"
          value={dateOfBirth}
          onChangeText={setDateOfBirth}
        />
        
        <Text style={styles.label}>Taille (en cm)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 180"
          value={height}
          onChangeText={setHeight}
          keyboardType="numeric"
        />

        <Text style={styles.label}>Poids actuel (en kg)</Text>
        <TextInput
          style={styles.input}
          placeholder="Ex: 75.5"
          value={weight}
          onChangeText={setWeight}
          keyboardType="numeric"
        />

        <Button title="Terminer l'inscription" onPress={handleContinue} />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 30,
  },
  label: {
    fontSize: 16,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    padding: 10,
    borderRadius: 5,
    marginBottom: 20,
    backgroundColor: '#fff', // Ajout d'un fond pour s'assurer qu'il est visible
  },
});

export default OnboardingScreen;