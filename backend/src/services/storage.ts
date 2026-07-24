// ============================================================
// Arquivamento do arquivo-fonte de cada importação (NF-e / planilha Domínio)
// no Supabase Storage. Antes desta camada, o disco do Railway é efêmero
// (some a cada redeploy) e o "Domínio" nem chegava a salvar o arquivo — só o
// nome. Isso deixava `ImportedDocument.filePath` sem serventia real de
// auditoria (não dava pra reabrir o arquivo original de uma importação
// antiga). Opcional por design: se as variáveis de ambiente não estiverem
// configuradas, `uploadImportedDocument` lança e quem chama decide o
// fallback (mesma tolerância já usada em Calendário/NFE_IMPORT_DIR — uma
// integração que falta configurar não deve quebrar o resto do sistema).
// ============================================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET ?? 'documentos-importados';

let client: SupabaseClient | null = null;
if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
  client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export const storageConfigured = client !== null;

export type TipoDocumentoImportado = 'nfe' | 'dominio';

/**
 * Envia o arquivo-fonte para `${bucket}/${companyId}/${tipoDocumento}/${nomeArquivo}`
 * e devolve o caminho completo salvo (usado como `ImportedDocument.filePath`).
 * Lança se o Storage não estiver configurado ou se o upload falhar — quem
 * chama decide se isso deve impedir o registro do documento como importado.
 */
export async function uploadImportedDocument(
  companyId: string,
  tipoDocumento: TipoDocumentoImportado,
  nomeArquivo: string,
  buffer: Buffer,
  contentType: string
): Promise<string> {
  if (!client) {
    throw new Error(
      'Supabase Storage não configurado (defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no backend/.env)'
    );
  }
  // Prefixo de timestamp evita colisão entre arquivos de mesmo nome
  // reenviados em datas diferentes (upsert:false abaixo torna isso explícito
  // em vez de sobrescrever silenciosamente um arquivo já arquivado).
  const path = `${companyId}/${tipoDocumento}/${Date.now()}_${nomeArquivo}`;
  const { error } = await client.storage.from(BUCKET).upload(path, buffer, { contentType, upsert: false });
  if (error) {
    throw new Error(`Falha no upload para Supabase Storage: ${error.message}`);
  }
  return `${BUCKET}/${path}`;
}
