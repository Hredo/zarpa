/*
 * Fuentes que se empaquetan. Se importan peso a peso (subcarpetas del paquete)
 * y no desde el índice: el índice arrastra todos los pesos de cada familia y
 * engorda el bundle con ficheros que la app nunca dibuja.
 */
import { AtkinsonHyperlegibleMono_400Regular } from '@expo-google-fonts/atkinson-hyperlegible-mono/400Regular';
import { AtkinsonHyperlegibleMono_500Medium } from '@expo-google-fonts/atkinson-hyperlegible-mono/500Medium';
import { AtkinsonHyperlegibleNext_400Regular } from '@expo-google-fonts/atkinson-hyperlegible-next/400Regular';
import { AtkinsonHyperlegibleNext_400Regular_Italic } from '@expo-google-fonts/atkinson-hyperlegible-next/400Regular_Italic';
import { AtkinsonHyperlegibleNext_500Medium } from '@expo-google-fonts/atkinson-hyperlegible-next/500Medium';
import { AtkinsonHyperlegibleNext_700Bold } from '@expo-google-fonts/atkinson-hyperlegible-next/700Bold';
import { AtkinsonHyperlegibleNext_700Bold_Italic } from '@expo-google-fonts/atkinson-hyperlegible-next/700Bold_Italic';
import { BricolageGrotesque_600SemiBold } from '@expo-google-fonts/bricolage-grotesque/600SemiBold';
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque/700Bold';
import { BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque/800ExtraBold';

export const fontAssets = {
  BricolageGrotesque_600SemiBold,
  BricolageGrotesque_700Bold,
  BricolageGrotesque_800ExtraBold,
  AtkinsonHyperlegibleNext_400Regular,
  AtkinsonHyperlegibleNext_400Regular_Italic,
  AtkinsonHyperlegibleNext_500Medium,
  AtkinsonHyperlegibleNext_700Bold,
  AtkinsonHyperlegibleNext_700Bold_Italic,
  AtkinsonHyperlegibleMono_400Regular,
  AtkinsonHyperlegibleMono_500Medium,
};
