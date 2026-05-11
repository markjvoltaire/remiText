import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers";
import type { AdvancedIMessage } from "@photon-ai/advanced-imessage";

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
  if (!client || !Array.isArray(client)) return undefined;
  return (client as Array<{ client: AdvancedIMessage; phone: string }>)
    .find((c) => c.phone === spacePhone)?.client;
}

async function main() {
  const app = await Spectrum({
    projectId: process.env.PROJECT_ID!,
    projectSecret: process.env.PROJECT_SECRET!,
    providers: [imessage.config()],
  });

  console.log("iMessage bot is running...");

  const seen = new Set<string>();

  for await (const [space, message] of app.messages) {
    await space.responding(async () => {
      const text = message.content.type === "text" ? message.content.text : "";
      if (!text) return;

      const id = (message as any).id ?? `${text}-${Date.now()}`;
      if (seen.has(id)) return;
      seen.add(id);
      if (seen.size > 500) seen.clear();

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
