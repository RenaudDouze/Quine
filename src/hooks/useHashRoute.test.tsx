import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { navigate, useHashRoute } from "./useHashRoute";

function Probe() {
  const route = useHashRoute();
  return <span data-testid="route">{route.name}</span>;
}

beforeEach(() => {
  window.location.hash = "";
});

describe("useHashRoute", () => {
  it("defaults to the home route when there is no hash", () => {
    render(<Probe />);
    expect(screen.getByTestId("route")).toHaveTextContent("home");
  });

  it("parses a route name from the hash", async () => {
    render(<Probe />);
    act(() => {
      window.location.hash = "editor";
    });
    await waitFor(() => expect(screen.getByTestId("route")).toHaveTextContent("editor"));
  });
});

describe("navigate", () => {
  it("sets the hash to the route name", () => {
    navigate("editor");
    expect(window.location.hash).toBe("#editor");
  });
});
