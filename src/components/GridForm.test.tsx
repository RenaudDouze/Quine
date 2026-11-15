import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import GridForm from "./GridForm";

afterEach(() => {
  cleanup();
});

describe("GridForm", () => {
  it("warns that the data is neither encrypted nor protected", () => {
    render(<GridForm submitLabel="Générer" onSubmit={vi.fn()} />);
    expect(screen.getByText(/ni chiffrées ni protégées/i)).toBeInTheDocument();
  });

  it("renders blank by default", () => {
    render(<GridForm submitLabel="Générer" onSubmit={vi.fn()} />);
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
          size: 5,
          freeCenter: true,
          winRule: "corners",
          items: Array.from({ length: 24 }, (_, i) => `item-${i}`),
        }}
      />
    );
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

  it("calls onSubmit with the split items", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<GridForm submitLabel="Générer" onSubmit={onSubmit} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /taille de la grille/i }), "3");
    await user.type(screen.getByPlaceholderText(/écrivez chaque phrase/i), "A\nB\nC\nD\nE\nF\nG\nH\nI");
    await user.click(screen.getByRole("button", { name: "Générer" }));
    expect(onSubmit).toHaveBeenCalledWith({
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
    await user.selectOptions(screen.getByRole("combobox", { name: /taille de la grille/i }), "3");
    await user.selectOptions(screen.getByRole("combobox", { name: /condition de victoire/i }), winRule);
    await user.type(screen.getByPlaceholderText(/écrivez chaque phrase/i), "A\nB\nC\nD\nE\nF\nG\nH\nI");
    await user.click(screen.getByRole("button", { name: "Générer" }));
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ winRule }));
  });

describe("GridForm — détails", () => {
  const hint = () => screen.getByTestId("count-hint");
  const textarea = () => screen.getByPlaceholderText(/écrivez chaque phrase/i);

  it("expects 25 cells for a 5x5 grid without free center, 24 with it, and 16 for a 4x4", async () => {
    const user = userEvent.setup();
    render(<GridForm submitLabel="Générer" onSubmit={vi.fn()} />);
    expect(hint()).toHaveTextContent("0 / 25");
    await user.click(screen.getByLabelText(/case centrale libre/i));
    expect(hint()).toHaveTextContent("0 / 24");
    await user.selectOptions(screen.getByRole("combobox", { name: /taille de la grille/i }), "4");
    expect(hint()).toHaveTextContent("0 / 16");
  });

  it("clears the free center when switching to an even size, and keeps it for an odd one", async () => {
    const user = userEvent.setup();
    render(<GridForm submitLabel="Générer" onSubmit={vi.fn()} />);
    const size = screen.getByRole("combobox", { name: /taille de la grille/i });
    const free = screen.getByLabelText(/case centrale libre/i);
    await user.click(free);
    await user.selectOptions(size, "3");
    expect(free).toBeChecked();
    await user.selectOptions(size, "4");
    expect(free).not.toBeChecked();
    await user.selectOptions(size, "5");
    expect(free).not.toBeChecked();
  });

  it("ignores blank lines and trims each entry", async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(<GridForm submitLabel="Générer" onSubmit={onSubmit} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /taille de la grille/i }), "3");
    await user.type(textarea(), "  A  {Enter}{Enter}   {Enter}B{Enter}C{Enter}D{Enter}E{Enter}F{Enter}G{Enter}H{Enter}I");
    expect(hint()).toHaveTextContent("9 / 9");
    await user.click(screen.getByRole("button", { name: "Générer" }));
    expect(onSubmit.mock.calls[0][0].items).toEqual(["A", "B", "C", "D", "E", "F", "G", "H", "I"]);
  });

  it("counts lines, not characters", async () => {
    const user = userEvent.setup();
    render(<GridForm submitLabel="Générer" onSubmit={vi.fn()} />);
    await user.type(textarea(), "abc");
    expect(hint()).toHaveTextContent("1 / 25");
  });

  it("blocks the browser's default submit", () => {
    render(<GridForm submitLabel="Générer" onSubmit={vi.fn()} />);
    expect(fireEvent.submit(screen.getByRole("button", { name: "Générer" }).closest("form")!)).toBe(false);
  });

  it("describes the shortfall, the exact count and the surplus, with matching styles", async () => {
    const user = userEvent.setup();
    render(<GridForm submitLabel="Générer" onSubmit={vi.fn()} />);
    await user.selectOptions(screen.getByRole("combobox", { name: /taille de la grille/i }), "3");
    await user.type(textarea(), "A{Enter}B");
    expect(hint().textContent).toBe("2 / 9 cases renseignées — ajoutez encore 7 entrée(s).");
    expect(hint().className).toBe("hint hint-error");
    await user.type(textarea(), "{Enter}C{Enter}D{Enter}E{Enter}F{Enter}G{Enter}H{Enter}I");
    expect(hint().textContent).toBe("9 / 9 cases renseignées ✓");
    expect(hint().className).toBe("hint hint-ok");
    await user.type(textarea(), "{Enter}J");
    expect(hint().textContent).toBe("10 / 9 cases renseignées (le surplus sera pioché au hasard) ✓");
    expect(hint().className).toBe("hint hint-ok");
  });
});
});
