export function SobreTab() {
  return (
    <section className="card">
      <h2>Sobre e privacidade</h2>
      <h3>O que o sistema faz</h3>
      <p>
        Lê o orçamento (Excel, PDF, Word ou imagem), compara cada item com a tabela SINAPI-BA da data-base informada,
        aponta as divergências e gera uma versão corrigida do documento com cada correção marcada e o valor original registrado.
      </p>
      <h3>Onde ficam os dados</h3>
      <ul>
        <li><strong>O arquivo do orçamento não sai do seu computador.</strong> A leitura, a verificação e a geração dos arquivos corrigidos acontecem no seu navegador.</li>
        <li>No banco de dados ficam: os usuários e seus papéis, as tabelas SINAPI-BA importadas e o <strong>histórico</strong> das verificações (nome do arquivo, data-base, resumo e lista de correções).</li>
        <li>O acesso exige login. As permissões (quem lê e quem altera o quê) são garantidas pelo próprio banco de dados.</li>
      </ul>
      <h3>Legenda das marcações</h3>
      <ul>
        <li><span className="chip marca-corrigido">Vermelho</span> valor corrigido (estava errado).</li>
        <li><span className="chip marca-recalculado">Amarelo</span> valor recalculado por consequência de outra correção.</li>
        <li><span className="chip marca-revisao">Laranja</span> precisa de revisão manual (não foi alterado).</li>
        <li><span className="chip marca-aviso">Azul</span> aviso ou informação.</li>
      </ul>
      <h3>Limites</h3>
      <ul className="small">
        <li>Itens sem código SINAPI (cotações, composições próprias) não são verificados quanto ao preço; só os cálculos.</li>
        <li>Documentos escaneados dependem da qualidade da imagem; valores lidos com baixa confiança vão para revisão manual.</li>
        <li>O sistema não substitui a análise técnica: confira as correções antes de usar o documento.</li>
      </ul>
    </section>
  );
}
