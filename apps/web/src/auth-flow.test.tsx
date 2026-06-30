import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { App } from "./App";

describe("Local Account access flow", () => {
  it("shows a pending approval state after registration", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: "Create Local Account" }));
    await user.type(screen.getByLabelText("Username"), "lin");
    await user.type(screen.getByLabelText("Email"), "lin@example.com");
    await user.type(screen.getByLabelText("Password"), "correct horse battery staple");
    await user.click(screen.getByRole("button", { name: "Request Access" }));

    expect(await screen.findByText("Account pending approval")).toBeInTheDocument();
    expect(screen.getByText("An Administrator needs to approve this Local Account before workspace access is available.")).toBeInTheDocument();
  });
});
