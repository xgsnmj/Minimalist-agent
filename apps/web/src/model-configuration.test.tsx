import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("Administrator Model Configuration surface", () => {
  it("shows provider catalog and model configuration controls", () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Model Configurations" })).toBeInTheDocument();
    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("DeepSeek")).toBeInTheDocument();
    expect(screen.getByText("MiniMax")).toBeInTheDocument();
    expect(screen.getByText("Custom OpenAI-compatible endpoint")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create Model Configuration" })).toBeInTheDocument();
  });
});
