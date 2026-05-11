import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers";
import type { AdvancedIMessage } from "@photon-ai/advanced-imessage";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function claimMessage(id: string): Promise<boolean> {
  const { error } = await supabase.from("seen_messages").insert({ id });
  if (!error) return true;
  if (error.code === "23505") return false; // duplicate key — already claimed
  console.error("Supabase claim error, processing anyway:", error.message);
  return true; // don't drop messages on unexpected errors
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY!,
});

async function getReply(userMessage: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 1024,
    thinking: { type: "adaptive" },
    system: "You are a helpful assistant replying via iMessage. Keep responses concise.",
    messages: [{ role: "user", content: userMessage }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  return textBlock?.type === "text" ? textBlock.text : "";
}

function getImessageClient(app: any, spacePhone: string): AdvancedIMessage | undefined {
  const runtime = app.__internal?.platforms?.get("iMessage");
  const client = runtime?.client;
  if (!client) return undefined;
  if (Array.isArray(client)) {
    return (client as Array<{ client: AdvancedIMessage; phone: string }>)
      .find((c) => c.phone === spacePhone)?.client;
  }
  console.log("iMessage client type:", typeof client, Object.keys(client));
  return undefined;
}

async function main() {
  const app = await Spectrum({
    projectId: process.env.PROJECT_ID!,
    projectSecret: process.env.PROJECT_SECRET!,
    providers: [imessage.config()],
  });

  console.log("iMessage bot is running...");

  for await (const [space, message] of app.messages) {
    await space.responding(async () => {
      const text = message.content.type === "text" ? message.content.text : "";
      if (!text) return;

      const id = (message as any).id;
      if (!id || !(await claimMessage(id))) return;

      const imessageClient = getImessageClient(app, (space as any).phone);
      await imessageClient?.chats.markRead(space.id).catch(() => {});

      console.log("Received:", text);
      const reply = await getReply(text);
      console.log("Replying:", reply);
      await message.reply(reply);
    });
  }
}

main().catch(console.error);
