(() => {
  "use strict";

  const STORAGE_KEY = "bingo.grids.v1";
  const app = document.getElementById("app");

  /** ---------- Storage ---------- */
  function loadGrids() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  function saveGrids(grids) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(grids));
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /** ---------- Grid helpers ---------- */
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function buildCells(items, size, freeCenter) {
    const total = size * size;
    const centerIndex = size % 2 === 1 ? Math.floor(total / 2) : -1;
    const useFree = freeCenter && centerIndex >= 0;
    const needed = useFree ? total - 1 : total;

    const pool = shuffle(items).slice(0, needed);
    const cells = [];
    let poolIdx = 0;
    for (let i = 0; i < total; i++) {
      if (useFree && i === centerIndex) {
        cells.push({ label: "GRATUIT", free: true, marked: true });
      } else {
        cells.push({ label: pool[poolIdx++], free: false, marked: false });
      }
    }
    return cells;
  }

  function checkWin(cells, size) {
    const marked = (i) => cells[i].marked;
    const winSet = new Set();
    let hasWin = false;

    // rows
    for (let r = 0; r < size; r++) {
      const idxs = [];
      for (let c = 0; c < size; c++) idxs.push(r * size + c);
      if (idxs.every(marked)) {
        hasWin = true;
        idxs.forEach((i) => winSet.add(i));
      }
    }
    // cols
    for (let c = 0; c < size; c++) {
      const idxs = [];
      for (let r = 0; r < size; r++) idxs.push(r * size + c);
      if (idxs.every(marked)) {
        hasWin = true;
        idxs.forEach((i) => winSet.add(i));
      }
    }
    // diagonals
    const d1 = [];
    const d2 = [];
    for (let i = 0; i < size; i++) {
      d1.push(i * size + i);
      d2.push(i * size + (size - 1 - i));
    }
    if (d1.every(marked)) {
      hasWin = true;
      d1.forEach((i) => winSet.add(i));
    }
    if (d2.every(marked)) {
      hasWin = true;
      d2.forEach((i) => winSet.add(i));
    }

    return { hasWin, winSet };
  }

  function neededCount(size, freeCenter) {
    const total = size * size;
    const centerIndex = size % 2 === 1 ? Math.floor(total / 2) : -1;
    const useFree = freeCenter && centerIndex >= 0;
    return useFree ? total - 1 : total;
  }

  /** ---------- Router ---------- */
  const routes = {
    home: renderHome,
    editor: renderEditor,
    play: renderPlay,
  };

  function parseHash() {
    const h = location.hash.slice(1);
    if (!h) return { name: "home" };
    const [name, id] = h.split("/");
    return { name: name || "home", id };
  }

  function navigate(name, id) {
    location.hash = id ? `${name}/${id}` : name;
  }

  window.addEventListener("hashchange", render);
  window.addEventListener("DOMContentLoaded", render);

  function render() {
    const { name, id } = parseHash();
    const fn = routes[name] || renderHome;
    app.innerHTML = "";
    fn(id);
  }

  /** ---------- Home ---------- */
  function renderHome() {
    const tpl = document.getElementById("tpl-home");
    app.appendChild(tpl.content.cloneNode(true));

    app.querySelectorAll('[data-action="new-grid"]').forEach((btn) =>
      btn.addEventListener("click", () => navigate("editor"))
    );

    const grids = loadGrids().sort((a, b) => b.updatedAt - a.updatedAt);
    const list = app.querySelector('[data-role="grid-list"]');
    const empty = app.querySelector('[data-role="empty-state"]');

    if (grids.length === 0) {
      empty.hidden = false;
      return;
    }

    const cardTpl = document.getElementById("tpl-card");
    grids.forEach((grid) => {
      const wrapper = document.createElement("div");
      wrapper.className = "grid-item";
      wrapper.appendChild(cardTpl.content.cloneNode(true));

      wrapper.querySelector('[data-role="title"]').textContent = grid.title;
      wrapper.querySelector('[data-role="meta"]').textContent =
        `${grid.size} × ${grid.size}${grid.freeCenter ? " · case libre" : ""}`;

      wrapper
        .querySelector('[data-role="open"]')
        .addEventListener("click", () => navigate("play", grid.id));

      wrapper
        .querySelector('[data-action="edit"]')
        .addEventListener("click", (e) => {
          e.stopPropagation();
          navigate("editor", grid.id);
        });

      wrapper
        .querySelector('[data-action="duplicate"]')
        .addEventListener("click", (e) => {
          e.stopPropagation();
          const all = loadGrids();
          const copy = JSON.parse(JSON.stringify(grid));
          copy.id = uid();
          copy.title = grid.title + " (copie)";
          copy.createdAt = Date.now();
          copy.updatedAt = Date.now();
          all.push(copy);
          saveGrids(all);
          render();
        });

      wrapper
        .querySelector('[data-action="delete"]')
        .addEventListener("click", (e) => {
          e.stopPropagation();
          if (confirm(`Supprimer la grille "${grid.title}" ?`)) {
            saveGrids(loadGrids().filter((g) => g.id !== grid.id));
            render();
          }
        });

      list.appendChild(wrapper);
    });
  }

  /** ---------- Editor ---------- */
  function renderEditor(id) {
    const tpl = document.getElementById("tpl-editor");
    app.appendChild(tpl.content.cloneNode(true));

    const existing = id ? loadGrids().find((g) => g.id === id) : null;
    app.querySelector('[data-role="editor-title"]').textContent = existing
      ? "Modifier la grille"
      : "Nouvelle grille";

    app.querySelector('[data-action="back"]').addEventListener("click", () => {
      navigate(existing ? "play" : "home", existing ? existing.id : undefined);
    });

    const form = app.querySelector('[data-role="form"]');
    const sizeSelect = form.elements.size;
    const freeCheckbox = form.elements.freeCenter;
    const itemsField = form.elements.items;
    const hint = app.querySelector('[data-role="count-hint"]');

    if (existing) {
      form.elements.title.value = existing.title;
      sizeSelect.value = String(existing.size);
      freeCheckbox.checked = !!existing.freeCenter;
      itemsField.value = (existing.items || []).join("\n");
    }

    function updateHint() {
      const size = parseInt(sizeSelect.value, 10);
      const canFree = size % 2 === 1;
      freeCheckbox.disabled = !canFree;
      if (!canFree) freeCheckbox.checked = false;

      const need = neededCount(size, freeCheckbox.checked);
      const lines = itemsField.value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);

      hint.classList.remove("hint-error", "hint-ok");
      if (lines.length < need) {
        hint.textContent = `${lines.length} / ${need} cases renseignées — ajoutez encore ${need - lines.length} entrée(s).`;
        hint.classList.add("hint-error");
      } else {
        hint.textContent = `${lines.length} / ${need} cases renseignées${lines.length > need ? " (le surplus sera pioché au hasard)" : ""} ✓`;
        hint.classList.add("hint-ok");
      }
    }

    sizeSelect.addEventListener("change", updateHint);
    freeCheckbox.addEventListener("change", updateHint);
    itemsField.addEventListener("input", updateHint);
    updateHint();

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const size = parseInt(sizeSelect.value, 10);
      const freeCenter = freeCheckbox.checked;
      const items = itemsField.value
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean);
      const need = neededCount(size, freeCenter);

      if (items.length < need) {
        hint.classList.add("hint-error");
        itemsField.focus();
        return;
      }

      const title = form.elements.title.value.trim() || "Grille de bingo";
      const grids = loadGrids();
      const now = Date.now();

      let grid;
      if (existing) {
        grid = grids.find((g) => g.id === existing.id);
        grid.title = title;
        grid.size = size;
        grid.freeCenter = freeCenter;
        grid.items = items;
        grid.cells = buildCells(items, size, freeCenter);
        grid.updatedAt = now;
      } else {
        grid = {
          id: uid(),
          title,
          size,
          freeCenter,
          items,
          cells: buildCells(items, size, freeCenter),
          createdAt: now,
          updatedAt: now,
        };
        grids.push(grid);
      }

      saveGrids(grids);
      navigate("play", grid.id);
    });
  }

  /** ---------- Play ---------- */
  function renderPlay(id) {
    const grids = loadGrids();
    const grid = grids.find((g) => g.id === id);
    if (!grid) {
      navigate("home");
      return;
    }

    const tpl = document.getElementById("tpl-play");
    app.appendChild(tpl.content.cloneNode(true));

    app.querySelector('[data-role="play-title"]').textContent = grid.title;
    app.querySelector('[data-action="back"]').addEventListener("click", () => navigate("home"));
    app.querySelector('[data-action="edit"]').addEventListener("click", () => navigate("editor", grid.id));

    const board = app.querySelector('[data-role="board"]');
    const banner = app.querySelector('[data-role="banner"]');
    board.style.gridTemplateColumns = `repeat(${grid.size}, 1fr)`;

    let bannerShown = false;

    function persist() {
      const all = loadGrids();
      const idx = all.findIndex((g) => g.id === grid.id);
      if (idx !== -1) {
        all[idx] = grid;
        grid.updatedAt = Date.now();
        saveGrids(all);
      }
    }

    function draw() {
      board.innerHTML = "";
      const { hasWin, winSet } = checkWin(grid.cells, grid.size);

      grid.cells.forEach((cell, i) => {
        const btn = document.createElement("button");
        btn.className = "cell";
        if (cell.marked) btn.classList.add("marked");
        if (cell.free) btn.classList.add("free");
        if (hasWin && winSet.has(i)) btn.classList.add("win");

        const label = document.createElement("span");
        label.className = "cell-label";
        label.textContent = cell.label;
        btn.appendChild(label);

        btn.addEventListener("click", () => {
          if (cell.free) return;
          cell.marked = !cell.marked;
          persist();
          draw();
        });

        board.appendChild(btn);
      });

      if (hasWin && !bannerShown) {
        bannerShown = true;
        banner.hidden = false;
      } else if (!hasWin) {
        bannerShown = false;
        banner.hidden = true;
      }
    }

    banner.addEventListener("click", () => {
      banner.hidden = true;
    });

    app.querySelector('[data-action="shuffle"]').addEventListener("click", () => {
      grid.cells = buildCells(grid.items, grid.size, grid.freeCenter);
      persist();
      draw();
    });

    app.querySelector('[data-action="reset"]').addEventListener("click", () => {
      grid.cells.forEach((c) => {
        if (!c.free) c.marked = false;
      });
      persist();
      draw();
    });

    draw();
  }

  /** ---------- Service worker ---------- */
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    });
  }
})();
