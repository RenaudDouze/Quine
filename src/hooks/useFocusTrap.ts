import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Piège le focus clavier à l'intérieur d'une modale : au montage, déplace le
 * focus dans le panneau et mémorise l'élément qui l'avait avant (page
 * derrière), pour l'y restaurer au démontage — sans quoi Tab ferait sortir
 * le focus vers du contenu masqué derrière l'overlay mais toujours
 * atteignable au clavier, et la fermeture laisserait le focus perdu (retombé
 * sur `<body>`) plutôt que de revenir sur le bouton qui a ouvert la modale.
 * Comme dans +1. */
export function useFocusTrap<T extends HTMLElement>(active = true) {
  const containerRef = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    // Toujours défini à ce stade : le ref est posé sur un nœud rendu de
    // façon inconditionnelle (jamais un montage optionnel), attaché par
    // React avant que cet effet ne s'exécute.
    const container = containerRef.current!;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusableElements = () => Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
    // Le bouton "Fermer" est toujours présent en premier dans l'en-tête : à
    // défaut d'autre élément focusable, le panneau lui-même (tabIndex -1)
    // reçoit le focus plutôt que de le laisser nulle part.
    (focusableElements()[0] ?? container).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const elements = focusableElements();
      if (elements.length === 0) {
        e.preventDefault();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    container.addEventListener("keydown", onKeyDown);

    return () => {
      container.removeEventListener("keydown", onKeyDown);
      previouslyFocused?.focus();
    };
  }, [active]);

  return containerRef;
}
