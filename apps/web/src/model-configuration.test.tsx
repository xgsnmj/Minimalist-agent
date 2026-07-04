import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { App } from "./app/app";

describe("Administrator Model Configuration surface", () => {
  afterEach(() => {
    cleanup();
    window.history.pushState({}, "", "/");
  });

  it("shows provider catalog and model configuration controls", async () => {
    window.history.pushState({}, "", "/admin/models");
    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "模型配置" })).toBeInTheDocument();
    const models = screen.getByRole("region", { name: "模型配置" });
    const catalog = within(models).getByRole("region", { name: "模型提供商目录" });
    expect(await within(catalog).findByText("OpenAI")).toBeInTheDocument();
    expect(within(catalog).getByText("DeepSeek")).toBeInTheDocument();
    expect(within(catalog).getByText("MiniMax")).toBeInTheDocument();
    expect(within(catalog).getByText("Custom OpenAI-compatible endpoint")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "创建模型配置" })).toBeInTheDocument();
  });

  it("opens configuration detail and a local Create Model Configuration draft", async () => {
    const user = userEvent.setup();
    window.history.pushState({}, "", "/admin/models");
    render(<App />);

    const models = screen.getByRole("region", { name: "模型配置" });
    const catalog = within(models).getByRole("region", { name: "模型提供商目录" });
    for (const provider of [
      "OpenAI",
      "DeepSeek",
      "MiniMax",
      "Custom OpenAI-compatible endpoint",
    ]) {
      expect(await within(catalog).findByText(provider)).toBeInTheDocument();
    }
    expect(within(catalog).getByText("提供商目录只是创建入口，不代表该提供商已经配置或可用。")).toBeInTheDocument();

    const configurationList = within(models).getByRole("table", { name: "模型配置列表" });
    expect(await within(configurationList).findByRole("row", { name: /DeepSeek deepseek-reasoner secret:\/\/models\/deepseek-main 已启用 temperature 0\.2 后端未记录 详情/ })).toBeInTheDocument();
    expect(within(configurationList).getByRole("row", { name: /Custom OpenAI-compatible endpoint gateway-default 已停用 temperature 0\.4 后端未记录 详情/ })).toBeInTheDocument();
    await user.click(within(configurationList).getAllByRole("button", { name: "详情" })[2]);

    const detail = within(models).getByRole("region", { name: "模型配置详情" });
    expect(within(detail).getByRole("heading", { name: "gateway-default" })).toBeInTheDocument();
    expect(within(detail).getByText("凭据引用")).toBeInTheDocument();
    expect(within(detail).getByText("默认参数")).toBeInTheDocument();
    expect(within(detail).getByText("配置风险")).toBeInTheDocument();
    expect(within(detail).getByText("凭据引用缺失，请补齐后再启用。")).toBeInTheDocument();

    await user.click(within(models).getByRole("button", { name: "创建模型配置" }));
    const draft = within(models).getByRole("region", { name: "创建模型配置草稿" });
    expect(within(draft).getByLabelText("提供商")).toBeInTheDocument();
    expect(within(draft).getByLabelText("基础 URL")).toBeInTheDocument();
    expect(within(draft).getByLabelText("模型名称")).toBeInTheDocument();
    expect(within(draft).getByLabelText("凭据引用")).toBeInTheDocument();
    expect(within(draft).getByLabelText("温度")).toBeInTheDocument();
  });
});
