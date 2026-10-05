import AsyncStorage from '@react-native-async-storage/async-storage';

/** Marca de «ya se ofreció la bienvenida». Una sola vez en la vida de la instalación. */
const KEY = 'zarpa.bienvenida.v1';

export async function welcomeSeen(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(KEY)) != null;
  } catch {
    return true; // sin almacenamiento, mejor no insistir
  }
}

export async function markWelcomeSeen(): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, new Date().toISOString());
  } catch {
    // Sin marca la bienvenida podría repetirse; no es grave.
  }
}
