// Orçamento em Word (.docx) montado direto em XML (mesmos dados). VALORES FICTÍCIOS.
import JSZip from 'jszip';
import { calcularLinha, ORCAMENTO } from './generate';
import { totaisEtapas } from './generate-pdf';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const br = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const par = (t: string, bold = false) =>
  `<w:p><w:r>${bold ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;

/** Célula com propriedades em ordem do schema (tcW, gridSpan, vAlign) para testar a inserção do w:shd. */
function tc(conteudo: string | string[], opts: { span?: number; bold?: boolean; runs?: boolean } = {}) {
  const pr = `<w:tcPr><w:tcW w:w="0" w:type="auto"/>${opts.span ? `<w:gridSpan w:val="${opts.span}"/>` : ''}<w:vAlign w:val="center"/></w:tcPr>`;
  const paragrafos = (Array.isArray(conteudo) ? conteudo : [conteudo]).map((t) => {
    // opção "runs": divide o texto em dois runs, como o Word faz com frequência
    if (opts.runs && t.length > 3) {
      const m = Math.floor(t.length / 2);
      return `<w:p><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">${esc(t.slice(0, m))}</w:t></w:r><w:r><w:rPr><w:sz w:val="16"/></w:rPr><w:t xml:space="preserve">${esc(t.slice(m))}</w:t></w:r></w:p>`;
    }
    return par(t, opts.bold);
  });
  return `<w:tc>${pr}${paragrafos.join('')}</w:tc>`;
}

export async function orcamentoDocx(): Promise<ArrayBuffer> {
  const cab = ['Item', 'Código', 'Fonte', 'Descrição', 'Unid.', 'Quant.', 'Preço Unit. (R$)', 'Preço Unit. c/ BDI (R$)', 'Total (R$)'];
  const linhas: string[] = [`<w:tr>${cab.map((c) => tc(c, { bold: true })).join('')}</w:tr>`];
  const { etapas, geral } = totaisEtapas();
  let etapa = -1;
  for (const l of ORCAMENTO) {
    if (l.titulo) {
      etapa++;
      linhas.push(`<w:tr>${tc(l.item, { bold: true })}${tc('')}${tc('')}${tc(l.descricao, { span: 5, bold: true })}${tc(br(etapas[etapa]), { bold: true })}</w:tr>`);
    } else {
      const { pub, total } = calcularLinha(l);
      // descrições longas em dois parágrafos (como quem aperta Enter no meio)
      const desc = l.descricao.length > 80 ? [l.descricao.slice(0, l.descricao.lastIndexOf(' ', 70)), l.descricao.slice(l.descricao.lastIndexOf(' ', 70) + 1)] : l.descricao;
      linhas.push(
        `<w:tr>${tc(l.item)}${tc(l.codigo ?? '')}${tc(l.fonte ?? '')}${tc(desc)}${tc(l.und ?? '')}${tc(br(l.qtd!))}` +
          `${tc(`R$ ${br(l.pu!)}`, { runs: true })}${tc(br(pub))}${tc(br(total))}</w:tr>`,
      );
    }
  }
  linhas.push(`<w:tr>${tc('')}${tc('')}${tc('')}${tc('TOTAL GERAL', { span: 5, bold: true })}${tc(br(geral), { bold: true })}</w:tr>`);

  const grid = '<w:tblGrid>' + Array.from({ length: 9 }, () => '<w:gridCol w:w="1000"/>').join('') + '</w:tblGrid>';
  const body =
    par('PREFEITURA MUNICIPAL DE EXEMPLO', true) +
    par('Obra: Reforma da Escola Municipal') +
    par('Referência: SINAPI-BA 08/2026 – Não desonerado') +
    par('BDI adotado: 25,00%') +
    `<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/></w:tblPr>${grid}${linhas.join('')}</w:tbl>` +
    par('Responsável técnico: Eng. Fulano de Tal') +
    '<w:sectPr><w:pgSz w:w="16838" w:h="11906" w:orient="landscape"/></w:sectPr>';

  const zip = new JSZip();
  zip.file('[Content_Types].xml',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels',
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>');
  zip.file('word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`);
  const u = await zip.generateAsync({ type: 'uint8array' });
  return u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;
}
