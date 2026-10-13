import { analisarSinapi, lerPlanilhaSinapi, mesclarSinapi } from '../../src/sinapi/importer';
import type { SinapiTable } from '../../src/domain/types';
import { sinapiFormatoNovo } from '../fixtures/generate';

export function tabelaTeste(): SinapiTable {
  const previa = analisarSinapi('SINAPI_Referência_2026_08.xlsx', lerPlanilhaSinapi(sinapiFormatoNovo()));
  return mesclarSinapi(undefined, previa, { dataBase: '2026-08' });
}
