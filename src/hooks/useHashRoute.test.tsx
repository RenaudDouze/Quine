import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { navigate, useHashRoute } from "./useHashRoute";

function Probe() {
  const route = useHashRoute();
  return (
    <span data-testid="route">
      {route.name}
      {route.id ? `/${route.id}` : ""}
    </span>
  );
}

beforeEach(() => {
  window.location.hash = "";
});

describe("useHashRoute", () => {
  it("defaults to the home route when there is no hash", () => {
    render(<Probe />);
    expect(screen.getByTestId("route")).toHaveTextContent("home");
  });

  it("falls back to home when the route name segment is empty", async () => {
    render(<Probe />);
    act(() => {
      window.location.hash = "/some-id";
    });
    await waitFor(() => expect(screen.getByTestId("route")).toHaveTextContent("home"));
  });

  it("parses a route name and id from the hash", async () => {
    render(<Probe />);
    act(() => {
      window.location.hash = "play/abc123";
    });
    await waitFor(() =>
      expect(screen.getByTestId("route")).toHaveTextContent("play/abc123")
    );
  });
});

describe("navigate", () => {
  it("sets the hash to just the route name when no id is given", () => {
    navigate("editor");
    expect(window.location.hash).toBe("#editor");
  });

  it("sets the hash to name/id when an id is given", () => {
    navigate("play", "xyz");
    expect(window.location.hash).toBe("#play/xyz");
  });
});
