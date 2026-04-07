#!/usr/bin/env node

import { main } from "../dist/cli/ada.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// Resolve API key and provider from openclaw config or env
function resolveProvider() {
  // Check openclaw config first
  try {
    const cfgPath = join(homedir(), ".openclaw", "openclaw.json");
    const raw = readFileSync(cfgPath, "utf-8");
    const cfg = JSON.parse(raw);

    // Try ada-seed-engine plugin config (Anthropic key)
    const adaKey =
      cfg?.plugins?.entries?.["ada-seed-engine"]?.config?.anthropicApiKey;
    if (adaKey) {
      return {
        provider: "anthropic",
        apiKey: adaKey,
        baseUrl: "https://api.anthropic.com/v1/messages",
        models: { sonnet: "claude-sonnet-4-6", opus: "claude-opus-4-6" },
      };
    }

    // Try xAI from model providers
    const xaiProvider = cfg?.models?.providers?.xai;
    if (xaiProvider?.apiKey) {
      return {
        provider: "xai",
        apiKey: xaiProvider.apiKey,
        baseUrl: "https://api.x.ai/v1/chat/completions",
        models: {
          sonnet: "grok-4.20-0309",
          opus: "grok-4.20-0309-reasoning",
        },
      };
    }

    // Try xAI from plugin config (web search key)
    const xaiPluginKey =
      cfg?.plugins?.entries?.xai?.config?.webSearch?.apiKey;
    if (xaiPluginKey) {
      return {
        provider: "xai",
        apiKey: xaiPluginKey,
        baseUrl: "https://api.x.ai/v1/chat/completions",
        models: {
          sonnet: "grok-4.20-0309",
          opus: "grok-4.20-0309-reasoning",
        },
      };
    }
  } catch {
    // ignore config read errors
  }

  // Fallback to env
  if (process.env.ANTHROPIC_API_KEY) {
    return {
      provider: "anthropic",
      apiKey: process.env.ANTHROPIC_API_KEY,
      baseUrl: "https://api.anthropic.com/v1/messages",
      models: { sonnet: "claude-sonnet-4-6", opus: "claude-opus-4-6" },
    };
  }
  if (process.env.XAI_API_KEY) {
    return {
      provider: "xai",
      apiKey: process.env.XAI_API_KEY,
      baseUrl: "https://api.x.ai/v1/chat/completions",
      models: {
        sonnet: "grok-4.20-0309",
        opus: "grok-4.20-0309-reasoning",
      },
    };
  }

  throw new Error(
    "No API key found. Configure one via:\n" +
      "  openclaw config set plugins.entries.ada-seed-engine.config.anthropicApiKey <key>\n" +
      "  or set ANTHROPIC_API_KEY or XAI_API_KEY in environment",
  );
}

async function defaultLlm(prompt, model) {
  const provider = resolveProvider();
  const modelId = provider.models[model] ?? provider.models.sonnet;

  if (provider.provider === "anthropic") {
    const res = await fetch(provider.baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": provider.apiKey,
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

  if (provider.provider === "xai") {
    const res = await fetch(provider.baseUrl, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${provider.apiKey}`,
      },
      body: JSON.stringify({
        model: modelId,
        max_tokens: 4096,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "You are a precise JSON generator. Always respond with ONLY valid JSON. No markdown, no explanation, no code fences. Just the raw JSON object.",
          },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`xAI API error (${res.status}): ${text}`);
    }
    const data = await res.json();
    return data.choices[0].message.content;
  }

  throw new Error(`Unknown provider: ${provider.provider}`);
}

main(process.argv, defaultLlm);
