import { getCommandFeed } from "@/lib/command/feed";
import { CommandFeed } from "@/components/surface/command-feed";

export const dynamic = "force-dynamic";
export const metadata = { title: "Command" };

export default async function CommandPage() {
  const feed = await getCommandFeed(false); // fresh on server render
  return <CommandFeed initial={feed} />;
}
