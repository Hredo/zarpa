// Generado por tools/zarpa_models/publish.py. No editar a mano.
// Modelo: bioclip (int8), índice de 266365 especies (taxo+common/svd256).
// Umbrales calibrados para acertar al menos el 95 % (cota de Wilson, validación cruzada por
// especies) sobre 3430 fotos verificadas de 1167 especies que el modelo no vio al entrenar.
import type { BreedModel, SpeciesModel } from './config';

// Los `require` de recursos, en constantes de primer nivel (Metro los resuelve al empaquetar).
const ENCODER: number = require('../../assets/models/bioclip_int8.pte');
const INDEX: number = require('../../assets/models/species_index.bin');

export const BUNDLED_MODEL: SpeciesModel | null = {
  id: 'bioclip-int8-49fabca89b',
  encoder: { kind: 'asset', module: ENCODER },
  index: { kind: 'asset', module: INDEX },
  thresholds: {"class": 0.1904, "order": 0.4315, "family": 0.6217, "genus": 0.8346, "species": 0.9772},
  inputSize: 224,
};

export const BUNDLED_BREEDS: BreedModel | null = null;
