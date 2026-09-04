import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useFocusTrap } from "./useFocusTrap";

function TestModal({ active = true, buttonCount = 2 }: { active?: boolean; buttonCount?: number }) {
  const ref = useFocusTrap<HTMLDivElement>(active);
  return (
    <div ref={ref} tabIndex={-1} data-testid="panel">
      {Array.from({ length: buttonCount }, (_, i) => (
        <button key={i}>Bouton {i + 1}</button>
      ))}
    </div>
  );
}

describe("useFocusTrap", () => {
  it("déplace le focus sur le premier élément focusable du panneau au montage", () => {
    render(<TestModal />);
    expect(document.activeElement).toHaveTextContent("Bouton 1");
  });

  it("focus le panneau lui-même s'il ne contient aucun élément focusable", () => {
    render(<TestModal buttonCount={0} />);
    expect(document.activeElement).toBe(screen.getByTestId("panel"));
  });

  it("boucle du dernier au premier élément avec Tab", () => {
    render(<TestModal buttonCount={2} />);
    const buttons = screen.getAllByRole("button");
    buttons[1].focus();
    fireEvent.keyDown(screen.getByTestId("panel"), { key: "Tab" });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("boucle du premier au dernier élément avec Shift+Tab", () => {
    render(<TestModal buttonCount={2} />);
    const buttons = screen.getAllByRole("button");
    // Le focus initial (posé au montage) est déjà sur buttons[0].
    fireEvent.keyDown(screen.getByTestId("panel"), { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(buttons[1]);
  });

  it("ne touche pas au focus pour une touche autre que Tab", () => {
    render(<TestModal buttonCount={2} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.keyDown(screen.getByTestId("panel"), { key: "Enter" });
    expect(document.activeElement).toBe(buttons[0]);
  });

  it("ne bloque pas Tab au milieu de la liste (laisse le comportement natif du navigateur agir)", () => {
    render(<TestModal buttonCount={3} />);
    const buttons = screen.getAllByRole("button");
    buttons[1].focus();
    const notPrevented = fireEvent.keyDown(screen.getByTestId("panel"), { key: "Tab" });
    expect(notPrevented).toBe(true);
  });

  it("empêche Tab si le panneau ne contient aucun élément focusable, plutôt que de laisser le focus s'en échapper", () => {
    render(<TestModal buttonCount={0} />);
    const prevented = fireEvent.keyDown(screen.getByTestId("panel"), { key: "Tab" });
    expect(prevented).toBe(false);
  });

  it("restaure le focus sur l'élément externe qui l'avait avant le montage, une fois le panneau démonté", () => {
    const trigger = document.createElement("button");
    trigger.textContent = "Dehors";
    document.body.appendChild(trigger);
    trigger.focus();

    const { unmount } = render(<TestModal />);
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });

  it("ne déplace ni ne piège le focus quand `active` est false", () => {
    const outside = document.createElement("button");
    outside.textContent = "Dehors";
    document.body.appendChild(outside);
    outside.focus();

    render(<TestModal active={false} />);
    expect(document.activeElement).toBe(outside);

    outside.remove();
  });
});
