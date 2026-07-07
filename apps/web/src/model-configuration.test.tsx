import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { App } from "./app/app";

describe("Administrator Model Configuration surface", () => {
  const originalConfirm = window.confirm;

  afterEach(() => {
    cleanup();
    window.confirm = originalConfirm;
    window.history.pushState({}, "", "/");
  });

  it("shows ModelSettings and native tool controls as the main configuration surface", async () => {
    window.history.pushState({}, "", "/admin/models");
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "模型运行配置" })).toBeInTheDocument();
    const models = screen.getByRole("region", { name: "模型运行配置" });
    expect(await within(models).findByRole("complementary", { name: "模型配置列表" })).toHaveTextContent("gpt-5.5");
    expect(within(models).queryByRole("region", { name: "模型提供商目录" })).not.toBeInTheDocument();
    expect(within(models).getByRole("form", { name: "编辑模型配置" })).toBeInTheDocument();
    expect(within(models).getByRole("heading", { name: "ModelSettings" })).toBeInTheDocument();
    expect(within(models).getByRole("heading", { name: "OpenAI native tools" })).toBeInTheDocument();
    expect(within(models).getByLabelText("Temperature")).toBeInTheDocument();
    expect(within(models).getByLabelText("WebSearchTool")).toBeInTheDocument();
    expect(within(models).getByLabelText("ShellTool")).toBeInTheDocument();
  });

  it("opens configuration detail and creates a Model Configuration through the backend", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/models");
    render(<App />);

    const models = await screen.findByRole("region", { name: "模型运行配置" });
    const modelList = within(models).getByRole("complementary", { name: "模型配置列表" });
    await user.click(within(modelList).getByRole("button", { name: /gateway-default/ }));

    const editForm = within(models).getByRole("form", { name: "编辑模型配置" });
    expect(within(editForm).getByRole("heading", { name: "gateway-default" })).toBeInTheDocument();
    expect(within(editForm).getByText("Model credential is not configured.")).toBeInTheDocument();
    const editApiKeyInput = within(editForm).getByLabelText("API Key") as HTMLInputElement;
    expect(editApiKeyInput.type).toBe("password");
    await user.click(within(editForm).getByRole("button", { name: "显示 API Key" }));
    expect(editApiKeyInput.type).toBe("text");
    await user.click(within(editForm).getByRole("button", { name: "健康检查" }));
    expect(await within(models).findAllByText("Model credential is not configured.")).not.toHaveLength(0);

    await user.click(within(models).getByRole("button", { name: "创建模型配置" }));
    const dialog = screen.getByRole("dialog", { name: "创建模型配置" });
    const createForm = within(dialog).getByRole("form", { name: "创建模型配置" });
    const catalog = within(createForm).getByLabelText("模型提供商目录");
    expect(within(catalog).getByText("OpenAI")).toBeInTheDocument();
    expect(within(catalog).getByText("DeepSeek")).toBeInTheDocument();
    await user.type(within(createForm).getByLabelText("Base URL"), "https://api.openai.com/v1");
    await user.type(within(createForm).getByLabelText("模型名称"), "gpt-5-mini");
    const createApiKeyInput = within(createForm).getByLabelText("API Key") as HTMLInputElement;
    await user.click(within(createForm).getByRole("button", { name: "显示 API Key" }));
    expect(createApiKeyInput.type).toBe("text");
    await user.type(createApiKeyInput, "sk-openai-mini");
    await user.click(within(createForm).getByRole("button", { name: "保存模型配置" }));

    expect(await within(modelList).findByRole("button", { name: /gpt-5-mini/ })).toBeInTheDocument();
    expect(within(models).getByText("模型运行配置已创建。")).toBeInTheDocument();
  });

  it("deletes an unused Model Configuration through the backend", async () => {
    const user = userEvent.setup();
    window.confirm = vi.fn(() => true);
    window.history.pushState({}, "", "/admin/models");
    render(<App />);

    const models = await screen.findByRole("region", { name: "模型运行配置" });
    const modelList = within(models).getByRole("complementary", { name: "模型配置列表" });
    await user.click(within(modelList).getByRole("button", { name: /gateway-default/ }));
    expect(within(modelList).getByRole("button", { name: /gateway-default/ })).toBeInTheDocument();

    await user.click(within(models).getByRole("button", { name: "删除 gateway-default" }));

    expect(within(modelList).queryByRole("button", { name: /gateway-default/ })).not.toBeInTheDocument();
    expect(within(models).getByText("模型运行配置已删除。")).toBeInTheDocument();
  });
});
