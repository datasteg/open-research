export type Lang = 'en' | 'ko';
export type Fam = 'cb' | 'bis' | 'io' | 'acad';

export interface NodeLite { id: number; kind: string; slug: string; en: string; ko: string | null; parent: number | null; n: number; sub?: string | null }
export interface NodePage extends NodeLite { page: Page }
export interface Page {
  years: Record<string, [number, number, number, number]>;
  kinds: Record<string, number>;
  rel: Partial<Record<'topic' | 'concept' | 'org' | 'person' | 'place' | 'jel', [number, number][]>>;
  children: [number, number][] | [number, number, number][];
  data: Record<string, any>;
  concepts?: [number, number, number, string, number | null][];
  cotopics?: [number, number, number][];
  grove?: number;
  topics?: [number, number][];
  broader?: number | null;
  parent?: number | null;
  stated_n?: number;
  inferred_n?: number;
  aff?: Aff;
}

/** One line of a document list (scripts/build.py `row`). */
export interface Row { s: string; t: string; d: string | null; k: string; f: Fam; u: string; se: string | null; no: string | null; a: string[]; an: number; kw: [number, number]; tp: number[] }

/** The public record of one document (the research archive's atlas export, no quotes, no abstract). */
export interface Card {
  slug: string; doc_id: number; kind: string; unit: string; family: Fam; title: string; date: string | null; received: string | null;
  series: string | null; number: string | null; institution: string | null; publisher: number | null; url: string | null; pdf_url: string | null;
  authors: { name: string; p: number | null }[]; speaker: { name: string; p: number | null } | null; summary: string | null;
  keywords: { label: string; c: number | null; sal: string; kind: string; n: number | null; located: boolean }[];
  people: { name: string; kind: string; role: string; found: boolean; listed: boolean }[];
  orgs: [number, string][]; org_names: [string, string, boolean][];
  places: number[]; place_names: [string, string, boolean][]; period: { from?: number; to?: number } | null;
  jel_stated: number[]; jel_inferred: [number, number][]; jel_agree: number | null; topics: [number, number][];
  prov: { model: string | null; engine: string | null; text_source: string | null; vocab: string | null; profile_loaded: string | null; research_card: boolean; builder: string | null };
}

export interface GroveSummary {
  id: number; slug: string; en: string; ko: string; n: number; desc_en: string; desc_ko: string;
  years: Record<string, number>; topics: [number, string, string, string, number][];
  /** 2023–2025 over 2020–2022, minus one; documents published in the last 12 and 24 months; that 24-month share */
  growth: number | null; n12: number; n24: number; share24: number;
}
export interface Meta {
  built: string;
  surface: { surface: string; builder: string; release: string; release_accepted: string | null; built: string; content: string; cards_builder: string; counts: any };
  docs: number; families: Record<Fam, number>; kinds: Record<string, number>; decades: Record<string, number>; nodes: Record<string, number>;
  years: Record<string, number[]>; latest_received: string | null; new_week: number; new_month: number; groves: GroveSummary[]; grove_order: string[]; units: Record<string, number>;
  changes: { id: number; at: string; release: string; kind: string; node: number | null; detail: any }[]; unplaced: number;
  /** the latest received date: every "last N months" window counts back from it */
  ref: string;
}

/** A person's affiliation evidence (build.py affiliations): stated by the publisher, found in the card, or from a staff series. */
export interface AffRun { org: number | null; name: string | null; y0: number; y1: number; n: number; tier: 'stated' | 'found' | 'series' | 'coauthored' }
export interface Aff { latest: AffRun & { year: number }; timeline: AffRun[]; tier: AffRun['tier'] }
