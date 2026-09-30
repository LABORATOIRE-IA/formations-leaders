// Créneaux proposés. Modifiez ce fichier pour changer les jours ou les horaires.

export type DayDef = { key: string; label: string; date: string };
export type SlotDef = { id: string; day: string; start: string; end: string };

export const DAYS: DayDef[] = [
  { key: "jeu", label: "Jeudi", date: "15 octobre 2026" },
  { key: "ven", label: "Vendredi", date: "16 octobre 2026" },
];

export const SLOTS: SlotDef[] = [
  { id: "jeu-1400", day: "jeu", start: "14:00", end: "14:45" },
  { id: "jeu-1445", day: "jeu", start: "14:45", end: "15:30" },
  { id: "ven-1400", day: "ven", start: "14:00", end: "14:45" },
  { id: "ven-1445", day: "ven", start: "14:45", end: "15:30" },
];
