/*
 * Fuentes que se empaquetan. Se importan peso a peso (subcarpetas del paquete)
 * y no desde el índice: el índice arrastra los nueve pesos de cada familia y
 * engorda el bundle con ficheros que la app nunca dibuja.
 */
import { AtkinsonHyperlegibleMono_400Regular } from '@expo-google-fonts/atkinson-hyperlegible-mono/400Regular';
import { AtkinsonHyperlegibleMono_500Medium } from '@expo-google-fonts/atkinson-hyperlegible-mono/500Medium';
import { AtkinsonHyperlegibleNext_400Regular } from '@expo-google-fonts/atkinson-hyperlegible-next/400Regular';
import { AtkinsonHyperlegibleNext_400Regular_Italic } from '@expo-google-fonts/atkinson-hyperlegible-next/400Regular_Italic';
import { AtkinsonHyperlegibleNext_500Medium } from '@expo-google-fonts/atkinson-hyperlegible-next/500Medium';
import { AtkinsonHyperlegibleNext_700Bold } from '@expo-google-fonts/atkinson-hyperlegible-next/700Bold';
import { AtkinsonHyperlegibleNext_700Bold_Italic } from '@expo-google-fonts/atkinson-hyperlegible-next/700Bold_Italic';
import { BigShoulders_700Bold } from '@expo-google-fonts/big-shoulders/700Bold';
import { BigShoulders_800ExtraBold } from '@expo-google-fonts/big-shoulders/800ExtraBold';
import { BigShoulders_900Black } from '@expo-google-fonts/big-shoulders/900Black';

export const fontAssets = {
  BigShoulders_700Bold,
  BigShoulders_800ExtraBold,
  BigShoulders_900Black,
  AtkinsonHyperlegibleNext_400Regular,
  AtkinsonHyperlegibleNext_400Regular_Italic,
  AtkinsonHyperlegibleNext_500Medium,
  AtkinsonHyperlegibleNext_700Bold,
  AtkinsonHyperlegibleNext_700Bold_Italic,
  AtkinsonHyperlegibleMono_400Regular,
  AtkinsonHyperlegibleMono_500Medium,
};
