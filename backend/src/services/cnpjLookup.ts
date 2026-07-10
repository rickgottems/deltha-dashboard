// ============================================================
// Consulta de CNPJ na Receita Federal via BrasilAPI (dado público e
// gratuito, sem chave de API): razão social, endereço, CNAE, situação
// cadastral. NÃO dá acesso a nenhum dado financeiro/fiscal da empresa —
// isso é protegido por sigilo fiscal e só é acessível com o certificado
// digital (e-CNPJ) da própria empresa (ver services/nfeImport.ts).
// ============================================================

export interface CnpjInfo {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacaoCadastral: string | null;
  cnaeDescricao: string | null;
  endereco: string | null;
}

interface BrasilApiCnpjResponse {
  cnpj: string;
  razao_social: string;
  nome_fantasia: string | null;
  descricao_situacao_cadastral: string | null;
  cnae_fiscal_descricao: string | null;
  logradouro: string | null;
  numero: string | null;
  bairro: string | null;
  municipio: string | null;
  uf: string | null;
}

export function isValidCnpjFormat(cnpj: string): boolean {
  return /^\d{14}$/.test(cnpj.replace(/\D/g, ''));
}

export async function lookupCnpj(cnpjRaw: string): Promise<CnpjInfo | null> {
  const cnpj = cnpjRaw.replace(/\D/g, '');
  if (!isValidCnpjFormat(cnpj)) return null;

  // BrasilAPI bloqueia requisições sem User-Agent (retorna 403) — Node não
  // envia um por padrão, diferente de navegadores/PowerShell.
  const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`, {
    headers: { 'User-Agent': 'deltha-dashboard/1.0' },
  });
  if (!res.ok) return null; // CNPJ não encontrado ou serviço indisponível — segue sem autopreencher
  const data = (await res.json()) as BrasilApiCnpjResponse;

  const enderecoPartes = [
    [data.logradouro, data.numero].filter(Boolean).join(', '),
    data.bairro,
    [data.municipio, data.uf].filter(Boolean).join('/'),
  ].filter(Boolean);

  return {
    cnpj: data.cnpj,
    razaoSocial: data.razao_social,
    nomeFantasia: data.nome_fantasia,
    situacaoCadastral: data.descricao_situacao_cadastral,
    cnaeDescricao: data.cnae_fiscal_descricao,
    endereco: enderecoPartes.length > 0 ? enderecoPartes.join(' — ') : null,
  };
}
