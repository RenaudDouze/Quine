import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildCells, type Grid } from "./bingo";
import {
  buildShareUrl,
  decodeGridsFromParam,
  downloadBackup,
  encodeGridsToParam,
  parseBackupJson,
} from "./share";

/** Générateur déterministe (même seed = même résultat) à forte entropie. */
function pseudoRandomString(seed: number, length: number): string {
  let s = "";
  let x = seed;
  for (let i = 0; i < length; i++) {
    x = (x * 1103515245 + 12345) & 0x7fffffff;
    s += String.fromCharCode(32 + (x % 95));
  }
  return s;
}

/** Décode le payload compact (même logique que `decodeGridsFromParam`, sans
 * passer par `fromCompact`/`normalizeGrid`) pour inspecter directement quelles
 * clés le format compact inclut ou omet. */
function decodeCompactPayload(param: string): unknown[] {
  const base64 = param.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const json = new TextDecoder().decode(bytes);
  return JSON.parse(json) as unknown[];
}

function makeGrid(overrides: Partial<Grid> = {}): Grid {
  const size = overrides.size ?? 3;
  const freeCenter = overrides.freeCenter ?? false;
  const items = overrides.items ?? ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
  return {
    id: "fixed-id",
    title: "Grille test",
    size,
    freeCenter,
    items,
    cells: buildCells(items, size, freeCenter),
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe("downloadBackup", () => {
  let createElementSpy: ReturnType<typeof vi.spyOn>;
  let clickSpy: ReturnType<typeof vi.fn<() => void>>;
  let createObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let revokeObjectURLSpy: ReturnType<typeof vi.spyOn>;
  let lastAnchor: HTMLAnchorElement | null;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 22));
    clickSpy = vi.fn();
    lastAnchor = null;
    const originalCreateElement = document.createElement.bind(document);
    createElementSpy = vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = originalCreateElement(tag);
      if (tag === "a") {
        const anchor = el as HTMLAnchorElement;
        anchor.click = clickSpy;
        lastAnchor = anchor;
      }
      return el;
    });
    createObjectURLSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
    revokeObjectURLSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    createElementSpy.mockRestore();
    createObjectURLSpy.mockRestore();
    revokeObjectURLSpy.mockRestore();
  });

  it("crée un blob JSON contenant toutes les grilles", async () => {
    const grids = [makeGrid({ id: "g1" }), makeGrid({ id: "g2", title: "Autre" })];
    downloadBackup(grids);

    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    const blob = createObjectURLSpy.mock.calls[0][0] as Blob;
    expect(blob.type).toBe("application/json");
    const text = await blob.text();
    expect(JSON.parse(text)).toEqual(grids);
  });

  it("déclenche le téléchargement avec un nom de fichier daté", () => {
    downloadBackup([makeGrid()]);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(lastAnchor?.download).toBe("bingo-sauvegarde-2026-08-22.json");
  });

  it("révoque l'URL objet après le téléchargement", () => {
    downloadBackup([makeGrid()]);
    expect(revokeObjectURLSpy).toHaveBeenCalledWith("blob:mock-url");
  });

  it("attache le lien au document avant de déclencher le téléchargement, puis le retire", () => {
    const appendChildSpy = vi.spyOn(document.body, "appendChild");
    downloadBackup([makeGrid()]);
    expect(appendChildSpy).toHaveBeenCalledWith(lastAnchor);
    expect(lastAnchor?.isConnected).toBe(false);
    appendChildSpy.mockRestore();
  });
});

describe("parseBackupJson", () => {
  it("retourne null pour un JSON invalide", () => {
    expect(parseBackupJson("{invalide")).toBeNull();
  });

  it("retourne null si le JSON ne représente pas un tableau", () => {
    expect(parseBackupJson('{"title":"x","size":3,"items":[]}')).toBeNull();
  });

  it("retourne null pour un tableau vide", () => {
    expect(parseBackupJson("[]")).toBeNull();
  });

  it("retourne null si aucun élément du tableau n'est une grille valide", () => {
    expect(parseBackupJson('[1, "x", null, {"foo":"bar"}]')).toBeNull();
  });

  it("filtre les éléments invalides et garde les grilles valides", () => {
    const result = parseBackupJson(
      JSON.stringify([
        { title: "Valide", size: 3, items: ["A"] },
        { title: "Sans size, valide quand même", items: ["A"] },
        { size: 3, items: ["A"] }, // sans titre
        { title: "Sans items" }, // sans items
        null,
        42,
        "texte",
      ])
    );
    expect(result).toHaveLength(2);
    expect(result?.map((g) => g.title)).toEqual(["Valide", "Sans size, valide quand même"]);
  });

  it("régénère un id pour chaque grille importée", () => {
    const result = parseBackupJson(
      JSON.stringify([{ id: "ancien-id", title: "A", size: 3, items: ["A"] }])
    );
    expect(result?.[0].id).not.toBe("ancien-id");
    expect(result?.[0].id).toBeTruthy();
  });

  it('remplace un titre vide ou blanc par "Grille de bingo"', () => {
    expect(parseBackupJson(JSON.stringify([{ title: "", size: 3, items: [] }]))?.[0].title).toBe(
      "Grille de bingo"
    );
    expect(parseBackupJson(JSON.stringify([{ title: "   ", size: 3, items: [] }]))?.[0].title).toBe(
      "Grille de bingo"
    );
  });

  it("conserve un titre non vide", () => {
    const result = parseBackupJson(JSON.stringify([{ title: "Mon bingo", size: 3, items: [] }]));
    expect(result?.[0].title).toBe("Mon bingo");
  });

  it("retombe sur size=3 si la taille est absente ou invalide", () => {
    expect(parseBackupJson(JSON.stringify([{ title: "A", items: [] }]))?.[0].size).toBe(3);
    expect(parseBackupJson(JSON.stringify([{ title: "A", size: 0, items: [] }]))?.[0].size).toBe(3);
    expect(parseBackupJson(JSON.stringify([{ title: "A", size: -1, items: [] }]))?.[0].size).toBe(3);
  });

  it("conserve la taille fournie", () => {
    const result = parseBackupJson(JSON.stringify([{ title: "A", size: 5, items: [] }]));
    expect(result?.[0].size).toBe(5);
  });

  it("filtre les éléments non-string de items", () => {
    const result = parseBackupJson(
      JSON.stringify([{ title: "A", size: 3, items: ["A", 42, null, "B"] }])
    );
    expect(result?.[0].items).toEqual(["A", "B"]);
  });

  it("applique freeCenter=false si absent", () => {
    const result = parseBackupJson(JSON.stringify([{ title: "A", size: 3, items: [] }]));
    expect(result?.[0].freeCenter).toBe(false);
  });

  it("conserve freeCenter=true", () => {
    const result = parseBackupJson(
      JSON.stringify([{ title: "A", size: 3, items: [], freeCenter: true }])
    );
    expect(result?.[0].freeCenter).toBe(true);
  });

  it("régénère des cases fraîches si absentes", () => {
    const items = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
    const result = parseBackupJson(JSON.stringify([{ title: "A", size: 3, items }]));
    expect(result?.[0].cells).toHaveLength(9);
    expect(result?.[0].cells.every((c) => !c.marked)).toBe(true);
  });

  it("régénère des cases fraîches si le nombre de cases fournies ne correspond pas à la taille", () => {
    const items = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
    const result = parseBackupJson(
      JSON.stringify([{ title: "A", size: 3, items, cells: [{ label: "A", free: false, marked: true }] }])
    );
    expect(result?.[0].cells).toHaveLength(9);
  });

  it("conserve les cases fournies (dont les cases cochées) quand leur nombre correspond à la taille", () => {
    const cells = buildCells(["A", "B", "C", "D", "E", "F", "G", "H", "I"], 3, false).map((c, i) => ({
      ...c,
      marked: i < 3,
    }));
    const result = parseBackupJson(
      JSON.stringify([{ title: "A", size: 3, items: ["A"], cells }])
    );
    expect(result?.[0].cells.filter((c) => c.marked)).toHaveLength(3);
    expect(result?.[0].cells.map((c) => c.label)).toEqual(cells.map((c) => c.label));
  });

  it("normalise une case nulle à l'intérieur d'un tableau de bonne taille", () => {
    const result = parseBackupJson(JSON.stringify([{ title: "A", size: 1, items: [], cells: [null] }]));
    expect(result?.[0].cells).toEqual([{ label: "", free: false, marked: false }]);
  });

  it("normalise les cases mal formées à l'intérieur d'un tableau de bonne taille", () => {
    const result = parseBackupJson(
      JSON.stringify([
        { title: "A", size: 1, items: [], cells: [{ label: 42, free: "yes", marked: 1 }] },
      ])
    );
    expect(result?.[0].cells).toEqual([{ label: "", free: true, marked: true }]);
  });

  it("applique createdAt = maintenant si absent ou invalide", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 22));
    const result = parseBackupJson(JSON.stringify([{ title: "A", size: 3, items: [] }]));
    expect(result?.[0].createdAt).toBe(new Date(2026, 7, 22).getTime());
    vi.useRealTimers();
  });

  it("conserve createdAt fourni", () => {
    const result = parseBackupJson(
      JSON.stringify([{ title: "A", size: 3, items: [], createdAt: 123456 }])
    );
    expect(result?.[0].createdAt).toBe(123456);
  });

  it("met à jour updatedAt à l'import", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 7, 22));
    const result = parseBackupJson(
      JSON.stringify([{ title: "A", size: 3, items: [], updatedAt: 1 }])
    );
    expect(result?.[0].updatedAt).toBe(new Date(2026, 7, 22).getTime());
    vi.useRealTimers();
  });

  it("conserve la couleur, l'image de fond, l'épinglage et l'archivage fournis (sauvegarde JSON = fidélité totale)", () => {
    const result = parseBackupJson(
      JSON.stringify([
        {
          title: "A",
          size: 3,
          items: [],
          color: "#db2777",
          backgroundImageUrl: "https://example.com/bg.jpg",
          pinned: true,
          archived: true,
        },
      ])
    );
    expect(result?.[0]).toMatchObject({
      color: "#db2777",
      backgroundImageUrl: "https://example.com/bg.jpg",
      pinned: true,
      archived: true,
    });
  });

  it("laisse couleur et image de fond indéfinies, et pinned/archived à false, si absents", () => {
    const result = parseBackupJson(JSON.stringify([{ title: "A", size: 3, items: [] }]));
    expect(result?.[0].color).toBeUndefined();
    expect(result?.[0].backgroundImageUrl).toBeUndefined();
    expect(result?.[0].pinned).toBe(false);
    expect(result?.[0].archived).toBe(false);
  });

  it("ignore une couleur ou une image de fond mal formées (pas une chaîne)", () => {
    const result = parseBackupJson(
      JSON.stringify([{ title: "A", size: 3, items: [], color: 42, backgroundImageUrl: true }])
    );
    expect(result?.[0].color).toBeUndefined();
    expect(result?.[0].backgroundImageUrl).toBeUndefined();
  });

  it('retombe sur la condition de victoire "line" si absente ou invalide', () => {
    expect(parseBackupJson(JSON.stringify([{ title: "A", size: 3, items: [] }]))?.[0].winRule).toBe(
      "line"
    );
    expect(
      parseBackupJson(JSON.stringify([{ title: "A", size: 3, items: [], winRule: "n-importe-quoi" }]))
        ?.[0].winRule
    ).toBe("line");
  });

  it.each(["blackout", "corners"] as const)('conserve la condition de victoire "%s"', (winRule) => {
    const result = parseBackupJson(JSON.stringify([{ title: "A", size: 3, items: [], winRule }]));
    expect(result?.[0].winRule).toBe(winRule);
  });
});

describe("encodeGridsToParam / decodeGridsFromParam", () => {
  it("ne conserve pas les cases cochées dans le lien/QR (garde le format compact)", () => {
    const cells = buildCells(["A", "B", "C", "D", "E", "F", "G", "H", "I"], 3, false).map((c) => ({
      ...c,
      marked: true,
    }));
    const grids = [makeGrid({ cells })];
    const encoded = encodeGridsToParam(grids);
    const decoded = decodeGridsFromParam(encoded);
    expect(decoded?.[0].cells.every((c) => !c.marked)).toBe(true);
  });

  it("fait un aller-retour fidèle avec un tableau vide", () => {
    const encoded = encodeGridsToParam([]);
    expect(decodeGridsFromParam(encoded)).toEqual([]);
  });

  it("fait un aller-retour fidèle pour le titre, la taille, les mots et la case libre", () => {
    const items = Array.from({ length: 24 }, (_, i) => `item-${i}`);
    const grids = [makeGrid({ title: "Complet", size: 5, freeCenter: true, items })];
    const encoded = encodeGridsToParam(grids);
    const decoded = decodeGridsFromParam(encoded);
    expect(decoded).toHaveLength(1);
    expect(decoded?.[0]).toMatchObject({ title: "Complet", size: 5, freeCenter: true, items });
  });

  it("omet freeCenter du lien compact quand il vaut false", () => {
    const grids = [makeGrid({ freeCenter: false })];
    const encoded = encodeGridsToParam(grids);
    const decoded = decodeGridsFromParam(encoded);
    expect(decoded?.[0].freeCenter).toBe(false);
  });

  it("régénère des cases fraîches et mélangées (taille cohérente avec size/freeCenter)", () => {
    const items = ["A", "B", "C", "D", "E", "F", "G", "H", "I"];
    const grids = [makeGrid({ size: 3, freeCenter: false, items })];
    const encoded = encodeGridsToParam(grids);
    const decoded = decodeGridsFromParam(encoded);
    expect(decoded?.[0].cells).toHaveLength(9);
    expect(decoded?.[0].cells.map((c) => c.label).sort()).toEqual(items.slice().sort());
  });

  it("préserve les caractères spéciaux (accents, emoji) dans le titre et les mots", () => {
    const grids = [makeGrid({ title: "Écrémé 🎲 été – café", items: ["Été ☀️", "café"] })];
    const encoded = encodeGridsToParam(grids);
    const decoded = decodeGridsFromParam(encoded);
    expect(decoded?.[0].title).toBe("Écrémé 🎲 été – café");
    expect(decoded?.[0].items).toEqual(["Été ☀️", "café"]);
  });

  it("produit une chaîne compatible URL et se décode correctement (sans +, / ni =)", () => {
    // Contenu pseudo-aléatoire à forte entropie : garantit de générer, dans
    // le base64 brut, des caractères +, / et = qui doivent être neutralisés
    // pour un usage direct dans une URL. On vérifie aussi l'aller-retour
    // complet pour s'assurer que ce ne sont pas juste supprimés mais bien
    // substitués puis correctement inversés au décodage.
    let seenPlusOrSlashInRawBase64 = false
    for (let i = 0; i < 30; i++) {
      const title = pseudoRandomString(i + 1, 40);
      const rawBase64 = btoa(unescape(encodeURIComponent(title)));
      if (/[+/]/.test(rawBase64)) seenPlusOrSlashInRawBase64 = true;

      const encoded = encodeGridsToParam([makeGrid({ title })]);
      expect(encoded).not.toMatch(/[+/=]/);
      expect(decodeGridsFromParam(encoded)?.[0].title).toBe(title);
    }
    expect(seenPlusOrSlashInRawBase64).toBe(true);
  });

  it("régénère un id à chaque décodage (les ids ne sont pas transmis)", () => {
    const grids = [makeGrid({ id: "original" })];
    const encoded = encodeGridsToParam(grids);
    const decoded = decodeGridsFromParam(encoded);
    expect(decoded?.[0].id).not.toBe("original");
  });

  it("retourne null pour une chaîne invalide (base64/JSON corrompu)", () => {
    expect(decodeGridsFromParam("!!!pas-du-base64-valide???")).toBeNull();
  });

  it("retourne null si le contenu décodé n'est pas un tableau", () => {
    const notAnArray = btoa(JSON.stringify({ t: "x" }));
    expect(decodeGridsFromParam(notAnArray)).toBeNull();
  });

  it("fait un aller-retour fidèle pour la couleur et l'image de fond", () => {
    const grids = [
      makeGrid({ color: "#0d9488", backgroundImageUrl: "https://example.com/bg.jpg" }),
    ];
    const encoded = encodeGridsToParam(grids);
    const decoded = decodeGridsFromParam(encoded);
    expect(decoded?.[0].color).toBe("#0d9488");
    expect(decoded?.[0].backgroundImageUrl).toBe("https://example.com/bg.jpg");
  });

  it("omet la couleur et l'image de fond du lien compact quand elles sont absentes", () => {
    const encoded = encodeGridsToParam([makeGrid({ color: undefined, backgroundImageUrl: undefined })]);
    const decoded = decodeGridsFromParam(encoded);
    expect(decoded?.[0].color).toBeUndefined();
    expect(decoded?.[0].backgroundImageUrl).toBeUndefined();
  });

  it.each(["blackout", "corners"] as const)(
    'fait un aller-retour fidèle pour la condition de victoire "%s"',
    (winRule) => {
      const encoded = encodeGridsToParam([makeGrid({ winRule })]);
      const decoded = decodeGridsFromParam(encoded);
      expect(decoded?.[0].winRule).toBe(winRule);
    }
  );

  it('omet la condition de victoire du lien compact quand elle vaut "line" (par défaut)', () => {
    const encoded = encodeGridsToParam([makeGrid({ winRule: "line" })]);
    expect(decodeGridsFromParam(encoded)?.[0].winRule).toBe("line");
    // Le résultat décodé est identique avec ou sans la clé "w" (normalizeGrid
    // retombe sur "line" dans les deux cas) : seule une inspection directe du
    // payload compact prouve que la clé est bien omise, pas juste redondante.
    const compact = decodeCompactPayload(encoded)[0] as Record<string, unknown>;
    expect("w" in compact).toBe(false);
  });

  it('inclut la condition de victoire dans le payload compact quand elle n\'est pas "line"', () => {
    const encoded = encodeGridsToParam([makeGrid({ winRule: "blackout" })]);
    const compact = decodeCompactPayload(encoded)[0] as Record<string, unknown>;
    expect(compact.w).toBe("blackout");
  });

  it("ne transmet jamais l'épinglage ni l'archivage via le lien/QR (préférences de la liste de l'expéditeur)", () => {
    const grids = [makeGrid({ pinned: true, archived: true })];
    const encoded = encodeGridsToParam(grids);
    const decoded = decodeGridsFromParam(encoded);
    expect(decoded?.[0].pinned).toBe(false);
    expect(decoded?.[0].archived).toBe(false);
  });

  it("retombe sur items=[] si le champ \"i\" décodé n'est pas un tableau (payload corrompu)", () => {
    // Contrairement à parseBackupJson (qui filtre via isValidGrid), le
    // chemin lien/QR ne valide pas le type de "i" avant de le passer à
    // normalizeGrid : c'est le seul chemin qui exerce réellement le
    // fallback `Array.isArray(raw.items) ? ... : []`.
    const corrupted = btoa(JSON.stringify([{ t: "Corrompu", s: 3, i: "pas-un-tableau" }]));
    const decoded = decodeGridsFromParam(corrupted);
    expect(decoded?.[0].items).toEqual([]);
  });
});

describe("buildShareUrl", () => {
  afterEach(() => {
    window.history.pushState({}, "", "/");
  });

  it("ajoute le paramètre import encodant les grilles", () => {
    window.history.pushState({}, "", "/app");
    const grids = [makeGrid({ title: "Partagé" })];
    const url = new URL(buildShareUrl(grids));
    const param = url.searchParams.get("import");
    expect(param).toBe(encodeGridsToParam(grids));
  });

  it("retire le hash existant de l'URL", () => {
    window.history.pushState({}, "", "/app#ancien-hash");
    const url = new URL(buildShareUrl([makeGrid()]));
    expect(url.hash).toBe("");
  });

  it("conserve le chemin existant de l'URL", () => {
    window.history.pushState({}, "", "/mon-app/");
    const url = new URL(buildShareUrl([makeGrid()]));
    expect(url.pathname).toBe("/mon-app/");
  });
});
