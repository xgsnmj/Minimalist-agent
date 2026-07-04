import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CARD_SCHEMA_FIXTURES, CARD_SCHEMAS } from "./shared/card-schema-contract";
import { CARD_RENDERERS, ConversationCardView } from "./shared/conversation-message-rendering";

describe("Card Rendering contract", () => {
  it("renders every schema registered in the shared card contract", () => {
    expect(Object.keys(CARD_RENDERERS).sort()).toEqual([...CARD_SCHEMAS].sort());

    for (const schema of CARD_SCHEMAS) {
      const { unmount } = render(
        <ConversationCardView
          card={{
            schema,
            payload: CARD_SCHEMA_FIXTURES[schema],
          }}
        />,
      );

      expect(screen.getByTestId(`conversation-card-${schema}`)).toBeInTheDocument();
      unmount();
    }
  });
});
