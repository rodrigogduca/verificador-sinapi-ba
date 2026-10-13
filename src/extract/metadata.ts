// Data-base, regime, BDI e encargos a partir do texto do documento (design.md §5.2).
import { parseNumeroBR } from '../domain/numbers';
import { semAcentos } from '../domain/text';
import type { Metadados } from '../domain/types';

const MESES: Record<string, string> = {
  jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06',
  jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12',
};

function ano(a: string): string {
  return a.length === 2 ? `20${a}` : a;
}

export function extrairMetadados(texto: string): Metadados {
  const t = semAcentos(texto).replace(/\s+/g, ' ');
  const meta: Metadados = {};

  const padroes: RegExp[] = [
    /sinapi[^\d\n]{0,40}?(0[1-9]|1[0-2])\s*\/\s*(20\d{2})/i,
    /data[\s-]*base[^\d\n]{0,20}?(0[1-9]|1[0-2])\s*\/\s*(20\d{2})/i,
    /refer[eê]ncia[^\d\n]{0,20}?(0[1-9]|1[0-2])\s*\/\s*(20\d{2})/i,
  ];
  for (const re of padroes) {
    const m = t.match(re);
    if (m) {
      meta.dataBase = `${m[2]}-${m[1]}`;
      break;
    }
  }
  if (!meta.dataBase) {
    const m = t.match(/(?:sinapi|data[\s-]*base|refer[eê]ncia)[^\n]{0,40}?\b(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*\.?\s*(?:\/|de|-)?\s*(20\d{2}|\d{2})\b/i);
    if (m) meta.dataBase = `${ano(m[2])}-${MESES[m[1].toLowerCase()]}`;
  }

  const tl = t.toLowerCase();
  if (/n[aã]o[\s-]*desonerad|sem desonera/.test(tl)) meta.regime = 'nao_desonerado';
  else if (/com desonera|desonerad/.test(tl)) meta.regime = 'desonerado';

  const bdi = t.match(/\bBDI\b[^\d%\n]{0,25}?(\d{1,2}(?:[.,]\d{1,4})?)\s*%/i);
  if (bdi) meta.bdi = parseNumeroBR(bdi[1])! / 100;

  const enc = t.match(/encargos sociais[^\d%\n]{0,40}?(\d{2,3}(?:[.,]\d{1,4})?)\s*%/i);
  if (enc) meta.encargos = parseNumeroBR(enc[1])! / 100;

  return meta;
}
