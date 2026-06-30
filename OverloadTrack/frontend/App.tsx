import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StyleSheet, View } from 'react-native';

import OnboardingScreen from './screens/OnboardingScreen';
import WorkoutScreen from './screens/WorkoutScreen';
import WorkoutSessionScreen from './screens/WorkoutSessionScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <SafeAreaProvider>
      <View style={styles.root}>
        <NavigationContainer>
          <Stack.Navigator initialRouteName="Onboarding">
            <Stack.Screen 
              name="Onboarding" 
              component={OnboardingScreen} 
              options={{ headerShown: false }}
            />
            <Stack.Screen 
              name="Workout" 
              component={WorkoutScreen} 
              options={{ title: 'Entraînement' }} 
            />
            <Stack.Screen 
              name="WorkoutSession" 
              component={WorkoutSessionScreen} 
              options={{ title: 'Séance en cours' }} 
            />
          </Stack.Navigator>
        </NavigationContainer>
        <StatusBar style="auto" />
      </View>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});