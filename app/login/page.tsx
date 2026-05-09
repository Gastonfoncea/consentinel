import { LoginPasskeyForm } from "@/components/login-passkey-form";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { redirectTo?: string; username?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <LoginPasskeyForm
        initialRedirectTo={searchParams?.redirectTo || "/"}
        initialUsername={searchParams?.username || ""}
      />
    </main>
  );
}
