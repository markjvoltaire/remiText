import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { Spectrum } from "spectrum-ts";
import { imessage } from "spectrum-ts/providers";

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

      console.log("Received:", text);
      const reply = await getReply(text);
      console.log("Replying:", reply);
      await message.reply(reply);
    });
  }
}

main().catch(console.error);
