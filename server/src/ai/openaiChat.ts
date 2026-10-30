import OpenAI from "openai";
import { ChatMessage, ChatOptions, ChatResult } from "./provider.interface";

// Chat for the OpenAI-compatible providers (Groq, xAI). `extra` carries provider-specific parameters.
export async function openaiChat(
  client: OpenAI,
  model: string,
  messages: ChatMessage[],
  options: ChatOptions,
  extra: Record<string, unknown> = {}
): Promise<ChatResult> {
  const response = await client.chat.completions.create({
    model,
    messages,
    temperature: options.temperature ?? 0.2,
    max_completion_tokens: options.maxTokens ?? 800,
    ...(options.json ? { response_format: { type: "json_object" as const } } : {}),
    ...extra,
  });
  return {
    text: response.choices[0]?.message?.content ?? "",
    usage: { inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 },
  };
}
