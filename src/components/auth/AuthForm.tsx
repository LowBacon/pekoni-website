"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/Icons";
import { useToast } from "@/components/providers/ToastProvider";
import { usePreferences } from "@/components/providers/PreferencesProvider";

type Mode = "login" | "register";

export default function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const toast = useToast();
  const { sound } = usePreferences();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError(null);

    const form = new FormData(event.currentTarget);
    const payload =
      mode === "register"
        ? {
            username: String(form.get("username") ?? "").trim(),
            password: String(form.get("password") ?? ""),
            email: String(form.get("email") ?? "").trim(),
            minecraftUsername: String(form.get("minecraftUsername") ?? "").trim(),
          }
        : {
            username: String(form.get("username") ?? "").trim(),
            password: String(form.get("password") ?? ""),
          };

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setError(data.error ?? "Jokin meni pieleen.");
        sound("error");
        setPending(false);
        return;
      }

      sound("navigate");
      toast.success(
        mode === "register" ? "Tervetuloa Pekoniin" : "Tervetuloa takaisin",
        mode === "register" ? "Sait 1 000 coinsia matkaevääksi." : undefined,
      );
      router.push("/home");
      router.refresh();
    } catch {
      setError("Palvelimeen ei saatu yhteyttä.");
      sound("error");
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-[var(--radius-control)] border border-[color-mix(in_oklab,var(--color-danger-500)_30%,transparent)] bg-[color-mix(in_oklab,var(--color-danger-500)_8%,transparent)] px-3.5 py-3"
        >
          <Icon name="warning" size={16} className="mt-0.5 shrink-0 text-[var(--color-danger-400)]" />
          <p className="text-[13px] leading-snug text-[var(--color-danger-400)]">{error}</p>
        </div>
      )}

      <div>
        <label htmlFor="username" className="mb-1.5 block text-[13px] font-medium text-[var(--text-dim)]">
          Käyttäjänimi
        </label>
        <input
          id="username"
          name="username"
          className="field"
          autoComplete="username"
          autoCapitalize="none"
          required
          maxLength={16}
          placeholder="Kulkija"
        />
      </div>

      {mode === "register" && (
        <>
          <div>
            <label
              htmlFor="minecraftUsername"
              className="mb-1.5 block text-[13px] font-medium text-[var(--text-dim)]"
            >
              Minecraft-nimi <span className="text-[var(--text-faint)]">— valinnainen</span>
            </label>
            <input
              id="minecraftUsername"
              name="minecraftUsername"
              className="field"
              autoCapitalize="none"
              maxLength={16}
              placeholder="Sama kuin pelissä"
            />
            <p className="mt-1.5 text-xs text-[var(--text-faint)]">
              Käytetään hahmosi pään näyttämiseen. Voit lisätä sen myöhemminkin.
            </p>
          </div>

          <div>
            <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-[var(--text-dim)]">
              Sähköposti <span className="text-[var(--text-faint)]">— valinnainen</span>
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="field"
              autoComplete="email"
              placeholder="sinä@esimerkki.fi"
            />
          </div>
        </>
      )}

      <div>
        <label htmlFor="password" className="mb-1.5 block text-[13px] font-medium text-[var(--text-dim)]">
          Salasana
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            className="field pr-12"
            autoComplete={mode === "register" ? "new-password" : "current-password"}
            required
            minLength={mode === "register" ? 8 : undefined}
            placeholder={mode === "register" ? "Vähintään 8 merkkiä" : "••••••••"}
          />
          <button
            type="button"
            onClick={() => setShowPassword((value) => !value)}
            className="absolute right-1 top-1/2 flex size-9 -translate-y-1/2 items-center justify-center rounded-lg text-[var(--text-faint)] transition-colors hover:text-[var(--text-dim)]"
            aria-label={showPassword ? "Piilota salasana" : "Näytä salasana"}
          >
            <Icon name={showPassword ? "eyeOff" : "eye"} size={16} />
          </button>
        </div>
      </div>

      <button type="submit" className="btn btn-primary w-full" data-busy={pending || undefined} disabled={pending}>
        {pending ? "Hetki…" : mode === "register" ? "Luo tili" : "Kirjaudu sisään"}
        {!pending && <Icon name="arrowRight" size={15} className="btn-nudge" />}
      </button>

      <p className="pt-1 text-center text-[13px] text-[var(--text-muted)]">
        {mode === "register" ? (
          <>
            Onko sinulla jo tili?{" "}
            <Link href="/login" className="font-semibold text-[var(--color-emerald-400)]">
              Kirjaudu sisään
            </Link>
          </>
        ) : (
          <>
            Etkö ole vielä mukana?{" "}
            <Link href="/register" className="font-semibold text-[var(--color-emerald-400)]">
              Luo tili
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
