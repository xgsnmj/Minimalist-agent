import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./App";

describe("Administrator Model Configuration surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("shows provider catalog and model configuration controls", () => {
    window.history.pushState({}, "", "/admin/models");
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Model Configurations" })).toBeInTheDocument();
    const models = screen.getByRole("region", { name: "Model Configurations" });
    const catalog = within(models).getByRole("region", { name: "Model Provider Catalog" });
    expect(within(catalog).getByText("OpenAI")).toBeInTheDocument();
    expect(within(catalog).getByText("DeepSeek")).toBeInTheDocument();
    expect(within(catalog).getByText("MiniMax")).toBeInTheDocument();
    expect(within(catalog).getByText("Custom OpenAI-compatible endpoint")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Model Configuration" })).toBeInTheDocument();
  });

  it("opens configuration detail and a local Create Model Configuration draft", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/models");
    render(<App />);

    const models = screen.getByRole("region", { name: "Model Configurations" });
    const catalog = within(models).getByRole("region", { name: "Model Provider Catalog" });
    for (const provider of [
      "OpenAI",
      "Anthropic",
      "Google Gemini",
      "DeepSeek",
      "Qwen/DashScope",
      "Moonshot/Kimi",
      "Doubao",
      "Zhipu/GLM",
      "MiniMax",
      "OpenRouter",
      "Custom OpenAI-compatible endpoint",
    ]) {
      expect(within(catalog).getByText(provider)).toBeInTheDocument();
    }
    expect(within(catalog).getByText("Provider catalog is a creation entry, not availability status.")).toBeInTheDocument();

    const configurationList = within(models).getByRole("table", { name: "Model Configuration list" });
    expect(within(configurationList).getByRole("row", { name: /DeepSeek Reasoner deepseek-main enabled temperature 0\.2 today Details/ })).toBeInTheDocument();
    expect(within(configurationList).getByRole("row", { name: /Custom OpenAI-compatible endpoint gateway-default custom-gateway draft temperature 0\.4 yesterday Details/ })).toBeInTheDocument();
    await user.click(within(configurationList).getAllByRole("button", { name: "Details" })[3]);

    const detail = within(models).getByRole("region", { name: "Model Configuration detail" });
    expect(within(detail).getByRole("heading", { name: "gateway-default" })).toBeInTheDocument();
    expect(within(detail).getByText("Credential reference")).toBeInTheDocument();
    expect(within(detail).getByText("Default parameters")).toBeInTheDocument();
    expect(within(detail).getByText("Configuration risk")).toBeInTheDocument();
    expect(within(detail).getByText("Credential missing is admin-only and does not expose secret.")).toBeInTheDocument();

    await user.click(within(models).getByRole("button", { name: "Create Model Configuration" }));
    const draft = within(models).getByRole("region", { name: "Create Model Configuration draft" });
    expect(within(draft).getByLabelText("Provider")).toBeInTheDocument();
    expect(within(draft).getByLabelText("Base URL")).toBeInTheDocument();
    expect(within(draft).getByLabelText("Model name")).toBeInTheDocument();
    expect(within(draft).getByLabelText("Credential reference")).toBeInTheDocument();
    expect(within(draft).getByLabelText("Temperature")).toBeInTheDocument();
  });
});
