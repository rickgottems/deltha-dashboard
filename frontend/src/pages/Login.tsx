import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../lib/api';
import { Button, Field, TextInput } from '../components/ui';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(identifier, password);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível entrar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm rounded-xl border border-line bg-panel p-6">
        <div className="mb-6 flex items-center gap-2.5">
          <img src="/deltha-mark.png" alt="" className="h-9 w-9 shrink-0 object-contain" />
          <div>
            <div className="text-sm font-extrabold tracking-[0.14em]">
              RADAR DELTHA<span className="text-accent">·</span>
            </div>
            <div className="text-[10px] uppercase tracking-widest text-mut">Gestão empresarial</div>
          </div>
        </div>

        <h1 className="mb-1 text-lg font-bold">Entrar</h1>
        <p className="mb-5 text-xs text-mut">Acesse o dashboard da sua empresa.</p>

        <form onSubmit={onSubmit} className="space-y-3">
          <Field label="E-mail ou CNPJ">
            <TextInput
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="voce@empresa.com ou 00.000.000/0000-00"
              required
              autoFocus
            />
          </Field>
          <Field label="Senha">
            <TextInput type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </Field>

          {error && <p className="text-xs text-neg">{error}</p>}

          <Button type="submit" disabled={loading || !identifier || !password} className="flex w-full justify-center">
            {loading ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>

        <p className="mt-5 text-xs text-mut">
          Ainda não tem conta?{' '}
          <Link to="/signup" className="font-semibold text-accent hover:underline">
            Cadastre sua empresa
          </Link>
        </p>
      </div>
    </div>
  );
}
