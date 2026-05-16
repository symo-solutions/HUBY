import Link from "next/link";
import { LoginForm } from "./login-form";
import { Zap } from "lucide-react";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center gap-2 text-lg font-semibold">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Zap className="h-4 w-4" />
          </div>
          Smart Ads Controller
        </div>
        <div className="card p-8">
          <h1 className="text-2xl font-semibold tracking-tight">Bon retour</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Connectez-vous pour accéder à votre tableau de bord.
          </p>
          <div className="mt-6">
            <LoginForm />
          </div>
          <p className="mt-6 text-center text-sm text-muted-foreground">
            Nouveau ici ?{" "}
            <Link href="/register" className="font-medium text-primary hover:underline">
              Créer un compte
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
