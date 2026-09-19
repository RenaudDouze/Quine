import { describe, expect, it } from "vitest";
import { mergeVisibleOrder } from "./reorder";

function item(id: string) {
  return { id };
}

describe("mergeVisibleOrder", () => {
  it("réordonne la liste complète quand rien n'est filtré (tous les éléments visibles)", () => {
    const prev = [item("a"), item("b"), item("c")];
    const newOrder = [item("c"), item("a"), item("b")];
    expect(mergeVisibleOrder(prev, newOrder)).toEqual([item("c"), item("a"), item("b")]);
  });

  it("garde les éléments masqués à leur position et ne déplace que les éléments visibles entre eux", () => {
    // 'b' est masqué (ex : recherche active) : seuls 'a' et 'c' sont visibles
    // et permutés, 'b' doit rester à l'index 1.
    const prev = [item("a"), item("b"), item("c")];
    const newOrder = [item("c"), item("a")];
    expect(mergeVisibleOrder(prev, newOrder)).toEqual([item("c"), item("b"), item("a")]);
  });

  it("ne modifie rien quand aucun élément n'est visible (liste filtrée vide)", () => {
    const prev = [item("a"), item("b")];
    expect(mergeVisibleOrder(prev, [])).toEqual(prev);
  });

  it("ne modifie rien avec un seul élément visible", () => {
    const prev = [item("a"), item("b"), item("c")];
    expect(mergeVisibleOrder(prev, [item("b")])).toEqual(prev);
  });

  it("gère plusieurs blocs de masqués entrelacés avec les visibles", () => {
    // 'x' et 'z' masqués, 'a' 'b' 'c' visibles et inversés.
    const prev = [item("x"), item("a"), item("b"), item("z"), item("c")];
    const newOrder = [item("c"), item("b"), item("a")];
    expect(mergeVisibleOrder(prev, newOrder)).toEqual([item("x"), item("c"), item("b"), item("z"), item("a")]);
  });

  it("ne mute pas le tableau d'origine", () => {
    const prev = [item("a"), item("b")];
    const prevCopy = [...prev];
    mergeVisibleOrder(prev, [item("b"), item("a")]);
    expect(prev).toEqual(prevCopy);
  });
});
