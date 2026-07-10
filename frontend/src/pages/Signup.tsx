import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { Button, Field, TextInput } from '../components/ui';

const ACCOUNT_TYPES = [
  { key: 'DELTHA_CLIENT', label: 'Sou cliente Deltha', hint: 'Escritório já cuida da contabilidade e envia dados automaticamente (NF-e).' },
  { key: 'EXTERNO', label: 'Não sou cliente Deltha', hint: 'Vou lançar minhas receitas, despesas e vendas manualmente.' },
] as const;

export function Signup() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accountType, setAccountType] = useState<string>('EXTERNO');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register({ companyName, name, email, password, accountType });
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
          <Field label="Nome da empresa">
            <TextInput value={companyName} onChange={(e) => setCompanyName(e.target.value)} required autoFocus />
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
            disabled={loading || !companyName || !name || !email || password.length < 8}
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
