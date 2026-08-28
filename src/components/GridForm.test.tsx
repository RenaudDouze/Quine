import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import GridForm from "./GridForm";

afterEach(() => {
  cleanup();
});

describe("GridForm", () => {
  it("renders blank by default", () => {
    render(<GridForm submitLabel="Générer" onSubmit={vi.fn()} />);
    expect(screen.getByPlaceholderText(/bingo réunion/i)).toHaveValue("");
    expect(screen.getByRole("combobox", { name: /taille de la grille/i })).toHaveValue("5");
    expect(screen.getByLabelText(/case centrale libre/i)).not.toBeChecked();
    expect(screen.getByRole("combobox", { name: /condition de victoire/i })).toHaveValue("line");
  });

  it("pre-fills every field from `initial`", () => {
    render(
      <GridForm
        submitLabel="Enregistrer"
        onSubmit={vi.fn()}
        initial={{
          title: "Ancien titre",
          size: 5,
          freeCenter: true,
          winRule: "corners",
          items: Array.from({ length: 24 }, (_, i) => `item-${i}`),
        }}
      />
    );
    expect(screen.getByPlaceholderText(/bingo réunion/i)).toHaveValue("Ancien titre");
    expect(screen.getByLabelText(/case centrale libre/i)).toBeChecked();
    expect(screen.getByRole("combobox", { name: /condition de victoire/i })).toHaveValue("corners");
    expect(screen.getByPlaceholderText(/écrivez chaque phrase/i)).toHaveValue(
      Array.from({ length: 24 }, (_, i) => `item-${i}`).join("\n")
    );
  });

  it("shows the given submit label", () => {
    render(<GridForm submitLabel="Mon bouton" onSubmit={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Mon bouton" })).toBeInTheDocument();
  });

  it("does not call onSubmit when there are not enough items", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GridForm submitLabel="Générer" onSubmit={onSubmit} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /taille de la grille/i }), "3");
    await user.type(screen.getByPlaceholderText(/écrivez chaque phrase/i), "A\nB\nC");
    await user.click(screen.getByRole("button", { name: "Générer" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("falls back to a default title when only whitespace is entered", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GridForm submitLabel="Générer" onSubmit={onSubmit} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /taille de la grille/i }), "3");
    await user.type(screen.getByPlaceholderText(/écrivez chaque phrase/i), "A\nB\nC\nD\nE\nF\nG\nH\nI");
    // jsdom still enforces the native `required` attribute on submit, so
    // provide a title made only of spaces to exercise the trim() fallback.
    await user.type(screen.getByPlaceholderText(/bingo réunion/i), "   ");
    await user.click(screen.getByRole("button", { name: "Générer" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: "Grille de bingo" }));
  });

  it("calls onSubmit with the trimmed title and split items", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GridForm submitLabel="Générer" onSubmit={onSubmit} />);
    await user.type(screen.getByPlaceholderText(/bingo réunion/i), "  Ma grille  ");
    await user.selectOptions(screen.getByRole("combobox", { name: /taille de la grille/i }), "3");
    await user.type(screen.getByPlaceholderText(/écrivez chaque phrase/i), "A\nB\nC\nD\nE\nF\nG\nH\nI");
    await user.click(screen.getByRole("button", { name: "Générer" }));
    expect(onSubmit).toHaveBeenCalledWith({
      title: "Ma grille",
      size: 3,
      freeCenter: false,
      winRule: "line",
      items: ["A", "B", "C", "D", "E", "F", "G", "H", "I"],
    });
  });

  it("flags the surplus when more items are provided than needed", async () => {
    const user = userEvent.setup();
    render(<GridForm submitLabel="Générer" onSubmit={vi.fn()} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /taille de la grille/i }), "3");
    await user.type(
      screen.getByPlaceholderText(/écrivez chaque phrase/i),
      "A\nB\nC\nD\nE\nF\nG\nH\nI\nJ"
    );
    expect(screen.getByTestId("count-hint")).toHaveTextContent(/surplus/i);
  });

  it("includes freeCenter=true in the submitted values on an odd-sized grid", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GridForm submitLabel="Générer" onSubmit={onSubmit} />);
    await user.type(screen.getByPlaceholderText(/bingo réunion/i), "Grille libre");
    await user.selectOptions(screen.getByRole("combobox", { name: /taille de la grille/i }), "5");
    await user.click(screen.getByLabelText(/case centrale libre/i));
    await user.type(
      screen.getByPlaceholderText(/écrivez chaque phrase/i),
      Array.from({ length: 24 }, (_, i) => `item-${i}`).join("\n")
    );
    await user.click(screen.getByRole("button", { name: "Générer" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ freeCenter: true }));
  });

  it("disables and unchecks the free-center option for an even size", async () => {
    const user = userEvent.setup();
    render(<GridForm submitLabel="Générer" onSubmit={vi.fn()} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /taille de la grille/i }), "5");
    const checkbox = screen.getByLabelText(/case centrale libre/i);
    await user.click(checkbox);
    expect(checkbox).toBeChecked();

    await user.selectOptions(screen.getByRole("combobox", { name: /taille de la grille/i }), "4");
    expect(checkbox).not.toBeChecked();
    expect(checkbox).toBeDisabled();
  });

  it.each(["blackout", "corners"] as const)('includes the chosen win rule "%s"', async (winRule) => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GridForm submitLabel="Générer" onSubmit={onSubmit} />);
    await user.type(screen.getByPlaceholderText(/bingo réunion/i), "Avec règle");
    await user.selectOptions(screen.getByRole("combobox", { name: /taille de la grille/i }), "3");
    await user.selectOptions(screen.getByRole("combobox", { name: /condition de victoire/i }), winRule);
    await user.type(screen.getByPlaceholderText(/écrivez chaque phrase/i), "A\nB\nC\nD\nE\nF\nG\nH\nI");
    await user.click(screen.getByRole("button", { name: "Générer" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ winRule }));
  });
});
