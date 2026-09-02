// Icônes de l'app (en-tête/menu, carte de grille, fermeture des modales) :
// SVG dessinés à la main (comme le badge d'épingle dans GridCard), plutôt
// qu'une bibliothèque externe — un CDN casserait le fonctionnement
// hors-ligne (PWA), et pour ce volume d'icônes une dépendance npm n'apporte
// rien qu'un SVG direct n'apporte déjà (déjà tree-shaké par construction,
// zéro Ko de trop). Comme +1.
// `aria-hidden` : le libellé accessible vit déjà sur le bouton parent
// (aria-label/title), l'icône ne doit pas être annoncée une seconde fois.

export interface IconProps {
  className?: string;
  width?: number;
  height?: number;
}

const BASE = { viewBox: "0 0 24 24", width: 18, height: 18, "aria-hidden": true } as const;
const STROKE = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function SearchIcon(props: IconProps) {
  return (
    <svg {...BASE} {...STROKE} {...props}>
      <circle cx="10" cy="10" r="6.5" />
      <line x1="15" y1="15" x2="20.5" y2="20.5" />
    </svg>
  );
}

export function SunIcon(props: IconProps) {
  return (
    <svg {...BASE} {...STROKE} {...props}>
      <circle cx="12" cy="12" r="4.5" />
      <line x1="12" y1="2" x2="12" y2="4.5" />
      <line x1="12" y1="19.5" x2="12" y2="22" />
      <line x1="2" y1="12" x2="4.5" y2="12" />
      <line x1="19.5" y1="12" x2="22" y2="12" />
      <line x1="4.9" y1="4.9" x2="6.6" y2="6.6" />
      <line x1="17.4" y1="17.4" x2="19.1" y2="19.1" />
      <line x1="4.9" y1="19.1" x2="6.6" y2="17.4" />
      <line x1="17.4" y1="6.6" x2="19.1" y2="4.9" />
    </svg>
  );
}

export function MoonIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props} fill="currentColor" stroke="none">
      <path d="M12.5 3a9 9 0 1 0 8.5 12.1A7 7 0 0 1 12.5 3z" />
    </svg>
  );
}

/** Thème "Auto" : un demi-disque plein sur un cercle, pour évoquer clair/sombre
 * à la fois plutôt qu'un choix précis. */
export function ThemeAutoIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props}>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth={1.8} />
      <path d="M12 4a8 8 0 0 1 0 16z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SyncIcon(props: IconProps) {
  return (
    <svg {...BASE} {...STROKE} {...props}>
      <path d="M20 11A8 8 0 0 0 6.3 6.3L4 8.6" />
      <path d="M4 4v4.6h4.6" />
      <path d="M4 13a8 8 0 0 0 13.7 4.7L20 15.4" />
      <path d="M20 20v-4.6h-4.6" />
    </svg>
  );
}

export function FullscreenIcon(props: IconProps) {
  return (
    <svg {...BASE} {...STROKE} {...props}>
      <path d="M4 9V5a1 1 0 0 1 1-1h4" />
      <path d="M15 4h4a1 1 0 0 1 1 1v4" />
      <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
      <path d="M9 20H5a1 1 0 0 1-1-1v-4" />
    </svg>
  );
}

/** Actives = visible/affichée, Archivées = mises de côté (hors de vue) : une
 * paire différente du contenant ouvert/fermé (dossier, bac) essayés avant. */
export function EyeIcon(props: IconProps) {
  return (
    <svg {...BASE} {...STROKE} {...props}>
      <path d="M2 12S5.5 5.5 12 5.5 22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12z" />
      <circle cx="12" cy="12" r="2.7" />
    </svg>
  );
}

export function ArchiveIcon(props: IconProps) {
  return (
    <svg {...BASE} {...STROKE} {...props}>
      <rect x="3" y="4" width="18" height="4" rx="1" />
      <path d="M4 8v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
      <line x1="10" y1="13" x2="14" y2="13" />
    </svg>
  );
}

export function MoreIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props} fill="currentColor" stroke="none">
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </svg>
  );
}

/** Poignée de glisser-déposer : grille de 6 points, convention standard pour
 * une prise en main. */
export function DragHandleIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props} fill="currentColor" stroke="none">
      <circle cx="9" cy="6" r="1.5" />
      <circle cx="15" cy="6" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="18" r="1.5" />
      <circle cx="15" cy="18" r="1.5" />
    </svg>
  );
}

const GEAR_TOOTH_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

/** Personnalisation (nom, couleur, image de fond) : un engrenage classique.
 * Dents posées par rotation autour du centre plutôt que sur un tracé dessiné
 * à la main : une silhouette anneau + dents reste lisible en petit format
 * (bouton de 26px), contrairement à une forme plus fine qui s'y brouille. */
export function GearIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props}>
      <circle cx="12" cy="12" r="5.5" fill="none" stroke="currentColor" strokeWidth={1.8} />
      <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
      {GEAR_TOOTH_ANGLES.map((angle) => (
        <rect
          key={angle}
          x="11"
          y="1.3"
          width="2"
          height="3.2"
          rx="0.6"
          transform={`rotate(${angle} 12 12)`}
          fill="currentColor"
          stroke="none"
        />
      ))}
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...BASE} {...STROKE} {...props}>
      <line x1="6" y1="6" x2="18" y2="18" />
      <line x1="18" y1="6" x2="6" y2="18" />
    </svg>
  );
}

/** Modifier une grille (contenu, taille, condition de victoire) : un crayon,
 * sans équivalent chez +1 (pas de bouton d'édition direct sur sa carte —
 * bingo distingue "Modifier" le contenu de "Personnaliser" l'apparence). */
export function PencilIcon(props: IconProps) {
  return (
    <svg {...BASE} {...STROKE} {...props}>
      <path d="M4 20l.7-3.9L15.6 5.2a1.7 1.7 0 0 1 2.4 0l1 1a1.7 1.7 0 0 1 0 2.4L8.1 19.5 4 20z" />
      <line x1="13.6" y1="7.2" x2="16.8" y2="10.4" />
    </svg>
  );
}

/** Partager une grille : flèche sortante, sans équivalent chez +1 (le
 * partage y vit derrière l'icône "actions" générique, pas un bouton dédié
 * sur la carte). */
export function ShareIcon(props: IconProps) {
  return (
    <svg {...BASE} {...STROKE} {...props}>
      <line x1="7" y1="17" x2="17" y2="7" />
      <path d="M9 7h8v8" />
    </svg>
  );
}

/** Dupliquer : deux rectangles superposés, convention "copier". Comme +1. */
export function DuplicateIcon(props: IconProps) {
  return (
    <svg {...BASE} {...STROKE} {...props}>
      <rect x="8" y="8" width="13" height="13" rx="2" />
      <path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

/** Épingler/détacher : même silhouette que le badge d'épingle sur la carte
 * (voir GridCard.tsx, qui réutilise ce composant). Comme +1. */
export function PinIcon(props: IconProps) {
  return (
    <svg {...BASE} {...props} fill="currentColor" stroke="none">
      <circle cx="12" cy="7" r="5" />
      <path d="M10.5 11.5h3L13 22h-2z" />
    </svg>
  );
}

/** Supprimer : corbeille classique. Comme +1. */
export function TrashIcon(props: IconProps) {
  return (
    <svg {...BASE} {...STROKE} {...props}>
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
  );
}

/** Remélanger la grille : flèches croisées, sans équivalent chez +1 (pas de
 * mélange aléatoire de contenu chez lui). */
export function ShuffleIcon(props: IconProps) {
  return (
    <svg {...BASE} {...STROKE} {...props}>
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      <line x1="15" y1="15" x2="21" y2="21" />
      <line x1="4" y1="4" x2="9" y2="9" />
    </svg>
  );
}

/** Réinitialiser les coches : flèche circulaire, sans équivalent chez +1 (pas
 * de coches à décocher chez lui). */
export function ResetIcon(props: IconProps) {
  return (
    <svg {...BASE} {...STROKE} {...props}>
      <path d="M20 12a8 8 0 1 1-2.34-5.66" />
      <path d="M20 4v5h-5" />
    </svg>
  );
}
