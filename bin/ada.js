#!/usr/bin/env node

import { main } from "../dist/cli/ada.js";

// Default LLM caller — uses Anthropic API via environment variable
async function defaultLlm(prompt, model) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY not set. Export it or pass a custom LLM caller.",
    );
  }

  const modelId =
    model === "opus" ? "claude-opus-4-6" : "claude-sonnet-4-6";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: modelId,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Anthropic API error (${res.status}): ${text}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

main(process.argv, defaultLlm);
