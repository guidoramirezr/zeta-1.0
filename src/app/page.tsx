import { ChatScreen } from "@/components/chat/ChatScreen";
import { getCurrentUser } from "@/server/auth/session";

// El chat es público: se abre siempre, con o sin sesión.
export default async function Home() {
  const user = await getCurrentUser();
  return <ChatScreen signedIn={user != null} />;
}
