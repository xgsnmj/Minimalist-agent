import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("Administrator Model Configuration surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("shows model configuration controls without making the provider catalog the main panel", async () => {
    window.history.pushState({}, "", "/admin/models");
    render(<App />);

    expect(await screen.findByRole("heading", { level: 1, name: "模型配置" })).toBeInTheDocument();
    const models = screen.getByRole("region", { name: "模型配置" });
    expect(await within(models).findByRole("table", { name: "模型配置列表" })).toBeInTheDocument();
    expect(within(models).queryByRole("region", { name: "模型提供商目录" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建模型配置" })).toBeInTheDocument();
  });

  it("opens configuration detail and creates a Model Configuration through the backend", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/models");
    render(<App />);

    const models = await screen.findByRole("region", { name: "模型配置" });

    const configurationList = within(models).getByRole("table", { name: "模型配置列表" });
    expect(await within(configurationList).findByRole("row", { name: /DeepSeek deepseek-reasoner 已配置 已启用 未检查 temperature 0\.2 未记录 详情/ })).toBeInTheDocument();
    expect(within(configurationList).getByRole("row", { name: /Custom OpenAI-compatible endpoint gateway-default 未配置 已停用 异常 temperature 0\.4/ })).toBeInTheDocument();
    await user.click(within(configurationList).getAllByRole("button", { name: "详情" })[2]);

    const detail = within(models).getByRole("region", { name: "模型配置详情" });
    expect(within(detail).getByRole("heading", { name: "gateway-default" })).toBeInTheDocument();
    expect(within(detail).getByText("凭据")).toBeInTheDocument();
    expect(within(detail).getByText("默认参数")).toBeInTheDocument();
    expect(within(detail).getByText("配置风险")).toBeInTheDocument();
    expect(within(detail).getByText("Model credential is not configured.")).toBeInTheDocument();
    expect(within(detail).getByRole("form", { name: "编辑模型配置" })).toBeInTheDocument();
    const editApiKeyInput = within(detail).getByLabelText("API Key") as HTMLInputElement;
    expect(editApiKeyInput.type).toBe("password");
    await user.click(within(detail).getByRole("button", { name: "显示 API Key" }));
    expect(editApiKeyInput.type).toBe("text");
    await user.click(within(detail).getByRole("button", { name: "健康检查" }));
    expect(await within(models).findAllByText("Model credential is not configured.")).not.toHaveLength(0);

    await user.click(within(models).getByRole("button", { name: "创建模型配置" }));
    const dialog = screen.getByRole("dialog", { name: "创建模型配置" });
    const createForm = within(dialog).getByRole("form", { name: "创建模型配置" });
    const catalog = within(createForm).getByLabelText("模型提供商目录");
    expect(within(catalog).getByText("OpenAI")).toBeInTheDocument();
    expect(within(catalog).getByText("DeepSeek")).toBeInTheDocument();
    expect(within(catalog).getByText("MiniMax")).toBeInTheDocument();
    expect(within(catalog).getByText("Custom OpenAI-compatible endpoint")).toBeInTheDocument();
    await user.type(within(createForm).getByLabelText("基础 URL"), "https://api.openai.com/v1");
    await user.type(within(createForm).getByLabelText("模型名称"), "gpt-5-mini");
    const createApiKeyInput = within(createForm).getByLabelText("API Key") as HTMLInputElement;
    expect(createApiKeyInput.type).toBe("password");
    await user.click(within(createForm).getByRole("button", { name: "显示 API Key" }));
    expect(createApiKeyInput.type).toBe("text");
    await user.type(createApiKeyInput, "sk-openai-mini");
    await user.click(within(createForm).getByRole("button", { name: "保存模型配置" }));

    expect(await within(configurationList).findByRole("row", { name: /OpenAI gpt-5-mini 已配置 已启用 未检查 temperature 0\.3 未记录 详情/ })).toBeInTheDocument();
    expect(within(models).getByText("模型配置已创建。")).toBeInTheDocument();
  });
});
