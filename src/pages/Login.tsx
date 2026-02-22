import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Phone, Mail, Lock, ArrowRight, Loader2, Shield } from 'lucide-react';
import { toast } from 'sonner';

const Login = () => {
  const navigate = useNavigate();
  const { signIn, isSuperAdmin, user } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  useEffect(() => {
    if (user) {
      navigate(isSuperAdmin ? '/dashboard' : '/dashboard/helpdesk', { replace: true });
    }
  }, [user, isSuperAdmin, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    const { error } = await signIn(loginEmail, loginPassword);

    if (error) {
      toast.error('Erro ao fazer login', {
        description: error.message,
      });
    } else {
      toast.success('Login realizado com sucesso!');
    }

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-aurora p-4">
      <div className="w-full max-w-md relative animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-emerald-600 mb-4 shadow-lg shadow-primary/25">
            <Phone className="w-8 h-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-display font-bold text-gradient">WsmartQR</h1>
          <p className="text-muted-foreground mt-2">Conecte-se ao futuro da comunicação</p>
        </div>

        <div className="glass-card p-6">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-foreground">Bem-vindo</h2>
            <p className="text-sm text-muted-foreground mt-1">Entre com sua conta para continuar</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email" className="text-foreground">Email</Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="login-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  required
                  disabled={isLoading}
                  className="pl-12 pr-3 bg-slate-800/50 border-slate-700/50"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password" className="text-foreground">Senha</Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={loginPassword}
                  onChange={(e) => setLoginPassword(e.target.value)}
                  required
                  disabled={isLoading}
                  className="pl-12 pr-3 bg-slate-800/50 border-slate-700/50"
                />
              </div>
            </div>
            <Button
              type="submit"
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Entrando...
                </>
              ) : (
                <>
                  Entrar
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </form>

          {/* Security badge */}
          <div className="flex items-center justify-center gap-2 mt-6 pt-4 border-t border-slate-700/50">
            <Shield className="w-4 h-4 text-primary" />
            <span className="text-sm text-muted-foreground">Conexão segura</span>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-6">
          Ao continuar, você concorda com nossos Termos de Serviço
        </p>
      </div>
    </div>
  );
};

export default Login;
