import { HomeShell } from "@/components/home-shell";
import { getSession } from "@/lib/auth/session";

export default async function Home() {
  const session = await getSession();
  const username = session.username ?? "guest";

  return <HomeShell username={username} />;
}
