import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { api, ApiError } from '../lib/api';
import { Button, Field, TextInput } from '../components/ui';

const ACCOUNT_TYPES = [
  { key: 'DELTHA_CLIENT', label: 'Sou cliente Deltha', hint: 'Escritório já cuida da contabilidade e envia dados automaticamente (NF-e).' },
  { key: 'EXTERNO', label: 'Não sou cliente Deltha', hint: 'Vou lançar minhas receitas, despesas e vendas manualmente.' },
] as const;

interface CnpjInfo {
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string | null;
  situacaoCadastral: string | null;
  cnaeDescricao: string | null;
  endereco: string | null;
}

function formatCnpj(v: string): string {
  const d = v.replace(/\D/g, '').slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

export function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [cnpj, setCnpj] = useState('');
  const [cnpjInfo, setCnpjInfo] = useState<CnpjInfo | null>(null);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cnpjError, setCnpjError] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState<string>('EXTERNO');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const digits = cnpj.replace(/\D/g, '');

  const buscarCnpj = async () => {
    setCnpjError(null);
    setCnpjInfo(null);
    setCnpjLoading(true);
    try {
      const info = await api.get<CnpjInfo>(`/api/auth/cnpj-lookup/${digits}`);
      setCnpjInfo(info);
      if (!companyName) setCompanyName(info.razaoSocial);
    } catch (err) {
      setCnpjError(err instanceof ApiError ? err.message : 'Não foi possível consultar o CNPJ agora.');
    } finally {
      setCnpjLoading(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register({ companyName, name, email, password, accountType, cnpj: digits });
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível cadastrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
      <div className="w-full max-w-md rounded-xl border border-line bg-panel p-6">
        <div className="mb-6 flex items-center gap-2.5">
          <img src="/deltha-mark.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
          <div>
            <div className="text-sm font-extrabold tracking-[0.14em]">
              RADAR DELTHA<span className="text-accent">·</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-mut">Gestão empresarial</div>
          </div>
        </div>

        <h1 className="mb-1 text-lg font-bold">Cadastrar empresa</h1>
        <p className="mb-5 text-xs text-mut">Crie sua conta para começar a usar o dashboard.</p>

        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="CNPJ">
            <div className="flex gap-2">
              <TextInput
                value={cnpj}
                onChange={(e) => {
                  setCnpj(formatCnpj(e.target.value));
                  setCnpjInfo(null);
                  setCnpjError(null);
                }}
                placeholder="00.000.000/0000-00"
                inputMode="numeric"
                required
              />
              <Button
                type="button"
                variant="ghost"
                onClick={buscarCnpj}
                disabled={digits.length !== 14 || cnpjLoading}
                className="shrink-0"
              >
                <span className="flex items-center gap-1.5">
                  <Search size={13} />
                  {cnpjLoading ? 'Buscando…' : 'Buscar'}
                </span>
              </Button>
            </div>
            <p className="mt-1 text-[10px] leading-snug text-mut">
              Preenche automaticamente razão social e endereço com dado público da Receita Federal. Não tem acesso a
              notas fiscais nem dados financeiros — isso exige o certificado digital da empresa.
            </p>
            {cnpjError && <p className="mt-1 text-[11px] text-neg">{cnpjError}</p>}
            {cnpjInfo && (
              <div className="mt-2 rounded-lg border border-pos/30 bg-pos/10 p-2.5 text-[11px] leading-snug text-ink">
                <p className="font-semibold">{cnpjInfo.razaoSocial}</p>
                {cnpjInfo.endereco && <p className="text-mut">{cnpjInfo.endereco}</p>}
                {cnpjInfo.cnaeDescricao && <p className="text-mut">{cnpjInfo.cnaeDescricao}</p>}
                {cnpjInfo.situacaoCadastral && <p className="text-mut">Situação: {cnpjInfo.situacaoCadastral}</p>}
              </div>
            )}
          </Field>

          <Field label="Nome da empresa">
            <TextInput value={companyName} onChange={(e) => setCompanyName(e.target.value)} required />
          </Field>
          <Field label="Seu nome">
            <TextInput value={name} onChange={(e) => setName(e.target.value)} required />
          </Field>
          <Field label="E-mail">
            <TextInput type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Senha (mínimo 8 caracteres)">
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required />
          </Field>

          <div>
            <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-mut">Tipo de conta</span>
            <div className="space-y-2">
              {ACCOUNT_TYPES.map((opt) => (
                <label
                  key={opt.key}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
                    accountType === opt.key ? 'border-accent/50 bg-accent/10' : 'border-line bg-panel2/40 hover:border-mut'
                  }`}
                >
                  <input
                    type="radio"
                    name="accountType"
                    value={opt.key}
                    checked={accountType === opt.key}
                    onChange={() => setAccountType(opt.key)}
                    className="mt-0.5"
                  />
                  <span>
                    <span className="block text-xs font-semibold">{opt.label}</span>
                    <span className="block text-[11px] leading-snug text-mut">{opt.hint}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          {error && <p className="text-xs text-neg">{error}</p>}

          <Button
            type="submit"
            disabled={loading || digits.length !== 14 || !companyName || !name || !email || password.length < 8}
            className="flex w-full justify-center"
          >
            {loading ? 'Criando conta…' : 'Criar conta'}
          </Button>
        </form>

        <p className="mt-5 text-xs text-mut">
          Já tem conta?{' '}
          <Link to="/login" className="font-semibold text-accent hover:underline">
            Entrar
          </Link>
        </p>
      </div>
    </div>
  );
}
