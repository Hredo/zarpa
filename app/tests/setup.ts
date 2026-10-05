// Reanimated 4 y Worklets traen sus dobles para Jest: sin ellos, importar los
// tokens del tema (que usan las curvas de animación) arrastra el runtime nativo.
jest.mock('react-native-worklets', () => require('react-native-worklets/src/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
// AsyncStorage (ajustes, comprobación diaria del catálogo) no tiene módulo nativo en Jest.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
