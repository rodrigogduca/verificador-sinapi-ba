// Motor de verificação e correção (design.md §6). Função pura: não depende de UI nem de formato.
import { formatBRL, formatPct, iguais, round2, somar } from '../domain/numbers';
import { dice, mesmaUnidade, normalizar, normalizarCodigo, similaridade } from '../domain/text';
import {
  entryKey, formatDataBase, REGIME_LABEL,
  type Campo, type Config, type Contexto, type Correcao, type Linha, type Marca, type Orcamento, type Regime,
  type Resultado, type ResultadoLinha, type SinapiEntry, type SinapiTable, type StatusLinha, type TipoDiv, type Valores,
} from '../domain/types';
import { FAIXAS_BDI } from './bdi';

export interface ParametrosVerificacao {
  dataBase: string;
  regime: Regime;
  bdi?: number;
  encargos?: number;
}

const SIM_OK = 0.98;
const SIM_MIN = 0.5;

function buscarReferencia(tabela: SinapiTable, codigo: string, fonte: string | undefined, descricao: string | undefined) {
  const insumoPrimeiro = !!fonte && /insumo|sinapi-?i\b/i.test(fonte);
  const ordem = insumoPrimeiro ? (['insumo', 'composicao'] as const) : (['composicao', 'insumo'] as const);
  const achados = ordem.map((t) => tabela.entries[entryKey(t, codigo)]).filter(Boolean) as SinapiEntry[];
  if (achados.length <= 1 || !descricao) return achados[0];
  // código existe como composição e como insumo: fica o de descrição mais parecida
  return achados.reduce((a, b) => (similaridade(descricao, b.descricao) > similaridade(descricao, a.descricao) ? b : a));
}

/** Decide, para o documento inteiro, se a única coluna de preço unitário já inclui BDI. */
function colunaUnicaTemBdi(orc: Orcamento, tabela: SinapiTable, p: ParametrosVerificacao, tol: number): boolean {
  if (p.bdi === undefined) return false;
  let sem = 0;
  let com = 0;
  for (const l of orc.linhas) {
    if (l.tipo !== 'item' || l.valores.precoUnit === undefined || l.valores.precoUnitBdi !== undefined) continue;
    const cod = normalizarCodigo(l.valores.codigo);
    const ref = cod ? buscarReferencia(tabela, cod, l.valores.fonte, l.valores.descricao) : undefined;
    const rp = ref?.preco[p.regime];
    if (rp === undefined) continue;
    if (iguais(l.valores.precoUnit, rp, tol)) sem++;
    else if (iguais(l.valores.precoUnit, round2(rp * (1 + p.bdi)), tol)) com++;
  }
  return com > sem;
}

/** BDI implícito mais frequente nas linhas com as duas colunas de preço. */
function inferirBdi(orc: Orcamento): { bdi?: number; distintos: number[] } {
  const cont = new Map<number, number>();
  for (const l of orc.linhas) {
    const { precoUnit: s, precoUnitBdi: c } = l.valores;
    if (l.tipo !== 'item' || s === undefined || c === undefined || s < 10) continue;
    const pct = Math.round((c / s - 1) * 10000) / 10000;
    cont.set(pct, (cont.get(pct) ?? 0) + 1);
  }
  if (cont.size === 0) return { distintos: [] };
  const ordenado = [...cont.entries()].sort((a, b) => b[1] - a[1]);
  // agrupa valores a menos de 0,1 p.p. (diferenças de arredondamento)
  const distintos: number[] = [];
  for (const [v] of ordenado) if (!distintos.some((d) => Math.abs(d - v) < 0.001)) distintos.push(v);
  return { bdi: ordenado[0][0], distintos };
}

export function verificar(orc: Orcamento, tabela: SinapiTable, p: ParametrosVerificacao, config: Config): Resultado {
  const tol = config.tolerancia;
  const refLabel = `SINAPI-BA ${formatDataBase(p.dataBase)} – ${REGIME_LABEL[p.regime]}`;
  const geral: Correcao[] = [];

  let bdi = p.bdi;
  const inferido = inferirBdi(orc);
  if (bdi === undefined && inferido.bdi !== undefined) {
    bdi = inferido.bdi;
    geral.push({ linha: -1, marca: 'aviso', tipo: 'informacao', motivo: `BDI não informado no documento; adotado o BDI implícito nos preços: ${formatPct(bdi)}.` });
  }
  if (p.bdi === undefined && inferido.distintos.length > 1) {
    geral.push({
      linha: -1, marca: 'aviso', tipo: 'bdi_inconsistente',
      motivo: `Itens com BDI diferentes aplicados: ${inferido.distintos.map((d) => formatPct(d)).join(', ')}.`,
    });
  }
  if (bdi !== undefined) {
    const faixa = FAIXAS_BDI[config.tipoObra];
    if (bdi < faixa.min - 1e-9 || bdi > faixa.max + 1e-9) {
      geral.push({
        linha: -1, marca: 'aviso', tipo: 'bdi_fora_faixa',
        motivo: `BDI de ${formatPct(bdi)} fora da faixa de referência do TCU (Acórdão 2622/2013) para "${faixa.label}": ${formatPct(faixa.min)} a ${formatPct(faixa.max)}.`,
      });
    }
  }
  const temColunaBdi = orc.linhas.some((l) => l.tipo === 'item' && l.valores.precoUnitBdi !== undefined);
  if (temColunaBdi && bdi === undefined) {
    geral.push({ linha: -1, marca: 'revisao', tipo: 'bdi_nao_informado', motivo: 'Há coluna de preço com BDI, mas o percentual de BDI não foi informado. Informe o BDI para verificar esses preços.' });
  }

  const unicaComBdi = colunaUnicaTemBdi(orc, tabela, { ...p, bdi }, tol);
  if (unicaComBdi) {
    geral.push({ linha: -1, marca: 'aviso', tipo: 'informacao', motivo: `A coluna de preço unitário foi identificada como preço COM BDI (${formatPct(bdi)}).` });
  }

  const resultados: ResultadoLinha[] = orc.linhas.map((linha) =>
    linha.tipo === 'item'
      ? verificarItem(linha, tabela, { ...p, bdi }, config, refLabel, unicaComBdi, orc.ocr)
      : { linha, status: 'nao_item' as StatusLinha, final: { ...linha.valores }, correcoes: [] },
  );

  verificarSomatorios(resultados, bdi, tol, refLabel);

  for (const r of resultados) {
    if (r.linha.tipo === 'nao_reconhecida') {
      r.correcoes.push(corr(r.linha, undefined, 'revisao', 'linha_nao_reconhecida',
        'Linha não reconhecida como item, título ou total. Confira manualmente.'));
      r.status = 'revisao';
    }
  }

  const correcoes = [...geral, ...resultados.flatMap((r) => r.correcoes)];
  return {
    linhas: resultados,
    correcoes,
    resumo: resumir(resultados, correcoes),
    contexto: {
      arquivo: orc.arquivo, dataBase: p.dataBase, regime: p.regime, bdi, encargos: p.encargos,
      verificadoEm: new Date().toISOString(), ocr: orc.ocr, tolerancia: tol,
    } satisfies Contexto,
    mapeamento: orc.mapeamento,
  };
}

function corr(
  linha: Linha, campo: Campo | undefined, marca: Marca, tipo: TipoDiv, motivo: string,
  original?: string | number, corrigido?: string | number,
): Correcao {
  const cell = campo ? linha.cells[campo] : undefined;
  const loc = cell?.loc ?? Object.values(linha.cells).find((c) => c?.loc && c.text)?.loc ?? Object.values(linha.cells).find((c) => c?.loc)?.loc;
  return { linha: linha.idx, campo, marca, tipo, motivo, original, corrigido, loc };
}

const CAMPOS_NUM: Campo[] = ['quantidade', 'precoUnit', 'precoUnitBdi', 'total', 'codigo'];

function verificarItem(
  linha: Linha, tabela: SinapiTable, p: ParametrosVerificacao, config: Config, refLabel: string,
  unicaComBdi: boolean, ocr: boolean,
): ResultadoLinha {
  const tol = config.tolerancia;
  const v = linha.valores;
  const final: Valores = { ...v };
  const cs: Correcao[] = [];
  const bdi = p.bdi;

  // OCR: valor lido com baixa confiança → não corrige nada nesta linha
  if (ocr) {
    const duvidosos = CAMPOS_NUM.filter((c) => {
      const conf = linha.cells[c]?.confidence;
      return conf !== undefined && linha.cells[c]?.text && conf < config.ocrConfiancaMin;
    });
    if (duvidosos.length) {
      cs.push(corr(linha, duvidosos[0], 'revisao', 'ocr_baixa_confianca',
        `Leitura OCR duvidosa (${duvidosos.join(', ')}). Confira os valores desta linha no documento original.`));
      return { linha, status: 'revisao', final, correcoes: cs };
    }
  }

  let ref: SinapiEntry | undefined;
  let semRef = false;
  let revisao = false;
  let bloquearPreco = false;

  const cod = normalizarCodigo(v.codigo);
  if (v.fonte && !/sinapi/i.test(v.fonte)) {
    semRef = true;
    cs.push(corr(linha, 'fonte', 'aviso', 'sem_referencia', `Item de fonte "${v.fonte}", não verificado contra o SINAPI.`));
  } else if (!cod) {
    semRef = true;
    cs.push(corr(linha, 'codigo', 'aviso', 'sem_referencia',
      v.codigo ? `Código "${v.codigo}" não é um código SINAPI; item não verificado.` : 'Item sem código SINAPI; não verificado.'));
  } else {
    ref = buscarReferencia(tabela, cod, v.fonte, v.descricao);
    if (!ref) {
      revisao = true;
      cs.push(corr(linha, 'codigo', 'revisao', 'codigo_inexistente', `Código ${cod} não existe no ${refLabel}.`, v.codigo));
    }
  }

  // nomes físicos das colunas de preço
  const campoSem: Campo | undefined = unicaComBdi ? undefined : v.precoUnit !== undefined ? 'precoUnit' : undefined;
  const campoCom: Campo | undefined = v.precoUnitBdi !== undefined ? 'precoUnitBdi' : unicaComBdi && v.precoUnit !== undefined ? 'precoUnit' : undefined;
  const pSem = campoSem ? v[campoSem as 'precoUnit'] : undefined;
  const pCom = campoCom ? v[campoCom as 'precoUnit' | 'precoUnitBdi'] : undefined;
  let pSemFinal = pSem;
  let pComFinal = pCom;

  if (ref) {
    // descrição
    if (v.descricao && normalizar(v.descricao) !== normalizar(ref.descricao)) {
      const sim = similaridade(v.descricao, ref.descricao);
      if (sim < SIM_MIN) {
        revisao = true;
        bloquearPreco = true;
        cs.push(corr(linha, 'descricao', 'revisao', 'possivel_codigo_errado',
          `Descrição muito diferente da do código ${ref.codigo} no SINAPI ("${ref.descricao}"). Verifique se o código está correto. Preço não corrigido.`,
          v.descricao, ref.descricao));
      } else if (dice(v.descricao, ref.descricao) < SIM_OK) {
        if (config.corrigirDescricao) {
          final.descricao = ref.descricao;
          cs.push(corr(linha, 'descricao', 'corrigido', 'descricao_divergente', `Descrição diferente da do ${refLabel}.`, v.descricao, ref.descricao));
        } else {
          cs.push(corr(linha, 'descricao', 'aviso', 'descricao_divergente', `Descrição diferente da do ${refLabel}: "${ref.descricao}".`, v.descricao, ref.descricao));
        }
      }
    }
    // unidade
    if (!bloquearPreco && v.unidade && ref.unidade && !mesmaUnidade(v.unidade, ref.unidade)) {
      final.unidade = ref.unidade;
      cs.push(corr(linha, 'unidade', 'corrigido', 'unidade_divergente', `Unidade diferente da do ${refLabel}.`, v.unidade, ref.unidade));
    }
    // preço
    const rp = ref.preco[p.regime];
    if (rp === undefined) {
      revisao = true;
      cs.push(corr(linha, campoSem ?? campoCom, 'revisao', 'regime_ausente',
        `O código ${ref.codigo} não tem preço ${REGIME_LABEL[p.regime]} na tabela importada. Importe a tabela desse regime.`));
    } else if (!bloquearPreco) {
      if (campoSem && pSem !== undefined) {
        if (!iguais(pSem, rp, tol)) {
          pSemFinal = rp;
          final[campoSem as 'precoUnit'] = rp;
          cs.push(corr(linha, campoSem, 'corrigido', 'preco_divergente',
            `Preço unitário diferente do ${refLabel} (diferença de ${formatBRL(round2(pSem - rp))}; ${formatPct((pSem - rp) / rp)}).`, pSem, rp));
        }
      }
      if (campoCom && pCom !== undefined && bdi !== undefined) {
        const esperado = round2((pSemFinal ?? rp) * (1 + bdi));
        if (campoSem && pSem !== undefined) {
          const esperadoOriginal = round2(pSem * (1 + bdi));
          if (!iguais(pCom, esperadoOriginal, tol)) {
            pComFinal = esperado;
            cs.push(corr(linha, campoCom, 'corrigido', 'bdi_incorreto',
              `Preço com BDI não corresponde ao preço sem BDI × (1 + ${formatPct(bdi)}).`, pCom, esperado));
          } else if (!iguais(pCom, esperado, tol)) {
            pComFinal = esperado;
            cs.push(corr(linha, campoCom, 'recalculado', 'preco_bdi_recalculado',
              `Preço com BDI recalculado após a correção do preço sem BDI.`, pCom, esperado));
          }
        } else if (!iguais(pCom, esperado, tol)) {
          pComFinal = esperado;
          cs.push(corr(linha, campoCom, 'corrigido', 'preco_divergente',
            `Preço com BDI diferente de ${refLabel} × (1 + ${formatPct(bdi)}) = ${formatBRL(esperado)}.`, pCom, esperado));
        }
        final[campoCom as 'precoUnitBdi'] = pComFinal;
      }
    }
  }

  // total da linha (vale também para itens sem referência)
  const q = v.quantidade;
  const tot = v.total;
  if (q !== undefined && tot !== undefined && (pSem !== undefined || pCom !== undefined)) {
    const tolTot = tol + Math.abs(q) * 0.005;
    let base: 'com' | 'sem';
    if (pCom !== undefined && iguais(tot, round2(q * pCom), tolTot)) base = 'com';
    else if (pSem !== undefined && iguais(tot, round2(q * pSem), tolTot)) base = 'sem';
    else base = pCom !== undefined ? 'com' : 'sem';
    const pOrig = (base === 'com' ? pCom : pSem)!;
    const pFin = (base === 'com' ? pComFinal : pSemFinal)!;
    const novo = round2(q * pFin);
    if (!iguais(tot, round2(q * pOrig), tolTot)) {
      final.total = novo;
      cs.push(corr(linha, 'total', 'corrigido', 'total_linha_incorreto',
        `Total da linha não confere com quantidade × preço unitário (${q} × ${formatBRL(pFin)}).`, tot, novo));
    } else if (!iguais(pFin, pOrig, tol)) {
      final.total = novo;
      cs.push(corr(linha, 'total', 'recalculado', 'total_recalculado', 'Total recalculado após a correção do preço unitário.', tot, novo));
    }
  }

  const marcas = cs.map((c) => c.marca);
  let status: StatusLinha = 'ok';
  if (revisao || marcas.includes('revisao')) status = 'revisao';
  else if (marcas.includes('corrigido') || marcas.includes('recalculado')) status = 'corrigido';
  else if (semRef) status = 'sem_referencia';
  return { linha, status, ref, final, correcoes: cs };
}

function verificarSomatorios(rs: ResultadoLinha[], bdi: number | undefined, tol: number, refLabel: string) {
  const itens = rs.filter((r) => r.linha.tipo === 'item' && r.linha.valores.total !== undefined);
  const somaOrig = (g: ResultadoLinha[]) => somar(g.map((r) => r.linha.valores.total!));
  const somaFinal = (g: ResultadoLinha[]) => somar(g.map((r) => r.final.total ?? r.linha.valores.total!));
  void refLabel;

  let inicioGrupo = 0;
  rs.forEach((r, pos) => {
    const t = r.linha.tipo;
    if (t !== 'titulo' && t !== 'subtotal' && t !== 'total') return;
    const valor = r.linha.valores.total;

    let grupo: ResultadoLinha[];
    if (t === 'total') grupo = itens;
    else if (t === 'titulo') {
      const num = r.linha.valores.itemNum;
      const desc = num ? itens.filter((i) => i.linha.valores.itemNum?.startsWith(num + '.')) : [];
      if (desc.length) grupo = desc;
      else {
        grupo = [];
        for (let k = pos + 1; k < rs.length && !['titulo', 'subtotal', 'total'].includes(rs[k].linha.tipo); k++) {
          if (rs[k].linha.tipo === 'item' && rs[k].linha.valores.total !== undefined) grupo.push(rs[k]);
        }
      }
    } else grupo = rs.slice(inicioGrupo, pos).filter((x) => x.linha.tipo === 'item' && x.linha.valores.total !== undefined);
    if (t === 'subtotal' || t === 'total') inicioGrupo = pos + 1;

    if (valor === undefined || grupo.length === 0) return;
    const so = somaOrig(grupo);
    const sf = somaFinal(grupo);
    const tolSoma = tol + 0.001 * grupo.length;
    const texto = normalizar(Object.values(r.linha.cells).map((c) => c?.text ?? '').join(' '));

    // total pode estar com BDI aplicado sobre a soma dos itens (sem BDI)
    let fator = 1;
    if (t === 'total' && bdi !== undefined) {
      const pedeBdi = /com bdi|c bdi/.test(texto);
      const semBdi = /sem bdi|s bdi/.test(texto);
      if (pedeBdi || (!semBdi && !iguais(valor, so, tolSoma) && iguais(valor, round2(so * (1 + bdi)), tolSoma))) fator = 1 + bdi;
    }
    const esperadoOrig = round2(so * fator);
    const esperadoFinal = round2(sf * fator);
    const rotulo = t === 'total' ? 'Total geral' : t === 'titulo' ? 'Total da etapa' : 'Subtotal';

    if (!iguais(valor, esperadoOrig, tolSoma)) {
      r.final.total = esperadoFinal;
      r.correcoes.push(corr(r.linha, 'total', 'corrigido', 'somatorio_incorreto',
        `${rotulo} não confere com a soma dos itens (${grupo.length} itens${fator !== 1 ? ', com BDI' : ''}).`, valor, esperadoFinal));
      r.status = 'corrigido';
    } else if (!iguais(esperadoFinal, esperadoOrig, tol)) {
      r.final.total = esperadoFinal;
      r.correcoes.push(corr(r.linha, 'total', 'recalculado', 'somatorio_recalculado', `${rotulo} recalculado após as correções dos itens.`, valor, esperadoFinal));
      r.status = 'corrigido';
    }
  });
}

function resumir(rs: ResultadoLinha[], cs: Correcao[]) {
  const itens = rs.filter((r) => r.linha.tipo === 'item');
  const porTipo: Partial<Record<TipoDiv, number>> = {};
  for (const c of cs) porTipo[c.tipo] = (porTipo[c.tipo] ?? 0) + 1;
  const totais = rs.filter((r) => r.linha.tipo === 'total' && r.linha.valores.total !== undefined);
  const ultimo = totais[totais.length - 1];
  const totalOriginal = ultimo ? ultimo.linha.valores.total! : somar(itens.map((r) => r.linha.valores.total ?? 0));
  const totalCorrigido = ultimo ? (ultimo.final.total ?? ultimo.linha.valores.total!) : somar(itens.map((r) => r.final.total ?? 0));
  return {
    itens: itens.length,
    ok: itens.filter((r) => r.status === 'ok').length,
    corrigidos: itens.filter((r) => r.status === 'corrigido').length,
    revisao: rs.filter((r) => r.status === 'revisao').length,
    semRef: itens.filter((r) => r.status === 'sem_referencia').length,
    naoReconhecidas: rs.filter((r) => r.linha.tipo === 'nao_reconhecida').length,
    avisos: cs.filter((c) => c.marca === 'aviso').length,
    totalOriginal,
    totalCorrigido,
    porTipo,
  };
}
