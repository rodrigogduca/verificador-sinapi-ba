import type { TipoObra } from '../domain/types';

/** Faixas de BDI do Acórdão TCU 2622/2013 (1º e 3º quartis). */
export const FAIXAS_BDI: Record<TipoObra, { label: string; min: number; max: number }> = {
  edificios: { label: 'Construção de edifícios', min: 0.2034, max: 0.25 },
  rodovias: { label: 'Rodovias e ferrovias', min: 0.196, max: 0.2423 },
  saneamento: { label: 'Redes de água, esgoto e correlatas', min: 0.2076, max: 0.2644 },
  portuarias: { label: 'Portuárias, marítimas e fluviais', min: 0.24, max: 0.2786 },
  fornecimento: { label: 'Fornecimento de materiais e equipamentos', min: 0.111, max: 0.168 },
};
