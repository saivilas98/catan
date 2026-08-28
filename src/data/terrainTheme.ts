import type {
  DevelopmentCardType,
  PlayerColor,
  ResourceType,
  TerrainType,
} from '../game/models/types';

export interface TerrainTheme {
  label: string;
  gradientFrom: string;
  gradientTo: string;
  stroke: string;
  icon: 'trees' | 'grass' | 'wheat' | 'rock' | 'clay' | 'sand';
  /** Illustrated hex artwork (public/hex), used as the tile's face. */
  art: string;
}

export const TERRAIN_THEME: Record<TerrainType, TerrainTheme> = {
  forest: {
    label: 'Forest',
    gradientFrom: '#2f5233',
    gradientTo: '#4f7942',
    stroke: '#1e3620',
    icon: 'trees',
    art: '/hex/web/forest-v3.webp',
  },
  pasture: {
    label: 'Pasture',
    gradientFrom: '#8bab5c',
    gradientTo: '#a8c672',
    stroke: '#5f7a3c',
    icon: 'grass',
    art: '/hex/web/pasture-v3.webp',
  },
  fields: {
    label: 'Fields',
    gradientFrom: '#d9a536',
    gradientTo: '#eec559',
    stroke: '#a5761f',
    icon: 'wheat',
    art: '/hex/web/fields-v3.webp',
  },
  mountains: {
    label: 'Mountains',
    gradientFrom: '#7a7d85',
    gradientTo: '#9fa3ac',
    stroke: '#4c4e54',
    icon: 'rock',
    art: '/hex/web/mountains-v3.webp',
  },
  hills: {
    label: 'Hills',
    gradientFrom: '#b5652f',
    gradientTo: '#cf8148',
    stroke: '#7d4419',
    icon: 'clay',
    art: '/hex/web/hills-v3.webp',
  },
  desert: {
    label: 'Desert',
    gradientFrom: '#e4cf9d',
    gradientTo: '#f0e0b8',
    stroke: '#b8a06a',
    icon: 'sand',
    art: '/hex/web/desert-v3.webp',
  },
};

export const RESOURCE_DISPLAY: Record<ResourceType, { icon: string; label: string }> = {
  brick: { icon: '🧱', label: 'Brick' },
  lumber: { icon: '🌲', label: 'Lumber' },
  wool: { icon: '🐑', label: 'Wool' },
  grain: { icon: '🌾', label: 'Grain' },
  ore: { icon: '⛰️', label: 'Ore' },
};

export const DEV_CARD_DISPLAY: Record<
  DevelopmentCardType,
  { icon: string; label: string; blurb: string; art: string }
> = {
  knight: {
    icon: '🛡️',
    label: 'Knight',
    blurb: 'Move the robber and steal',
    art: '/icon/devcards/knight.png',
  },
  roadBuilding: {
    icon: '🛣️',
    label: 'Road Building',
    blurb: 'Place 2 free roads',
    art: '/icon/devcards/road-building.png',
  },
  yearOfPlenty: {
    icon: '🎁',
    label: 'Year of Plenty',
    blurb: 'Take 2 from the bank',
    art: '/icon/devcards/year-of-plenty.png',
  },
  monopoly: {
    icon: '💰',
    label: 'Monopoly',
    blurb: 'Take all of one resource',
    art: '/icon/devcards/monopoly.png',
  },
  victoryPoint: {
    icon: '⭐',
    label: 'Victory Point',
    blurb: 'Counts secretly toward victory',
    art: '/icon/devcards/victory-point.png',
  },
};

export const PLAYER_COLOR_HEX: Record<string, string> = {
  red: '#c1443c',
  blue: '#3563a6',
  white: '#e8e4da',
  orange: '#d97b2b',
  green: '#4f8a52',
  purple: '#7d5aa6',
};

/**
 * Rendered game-piece art (public/icon/pieces), one per player color, plus the
 * single black robber. Each PNG was extracted from the source sprite sheet as a
 * tight alpha-cropped cutout — the aspect ratio here is that crop's actual size,
 * used to size the piece on the board without distorting it.
 */
export const PLAYER_PIECE_ART: Record<
  string,
  { settlement: string; city: string; road: string }
> = {
  red: {
    settlement: '/icon/pieces/red-settlement.webp',
    city: '/icon/pieces/red-city.webp',
    road: '/icon/pieces/red-road.webp',
  },
  blue: {
    settlement: '/icon/pieces/blue-settlement.webp',
    city: '/icon/pieces/blue-city.webp',
    road: '/icon/pieces/blue-road.webp',
  },
  white: {
    settlement: '/icon/pieces/white-settlement.webp',
    city: '/icon/pieces/white-city.webp',
    road: '/icon/pieces/white-road.webp',
  },
  orange: {
    settlement: '/icon/pieces/orange-settlement.webp',
    city: '/icon/pieces/orange-city.webp',
    road: '/icon/pieces/orange-road.webp',
  },
  // Settlements/cities are tight alpha cutouts extracted from icon_new.png's own
  // alpha channel (isolating the largest connected opaque region per piece — see
  // PIECE_ASPECT_OVERRIDE for their slightly different crop proportions). Roads
  // are NOT from icon_new.png — that source's road art didn't match the other 4
  // colors' long, flat bar shape, so these are white-road.webp recolored (hue
  // lifted from the settlement art) to keep every color's road looking the same.
  green: {
    settlement: '/icon/pieces/green-settlement.png',
    city: '/icon/pieces/green-city.png',
    road: '/icon/pieces/green-road.png',
  },
  purple: {
    settlement: '/icon/pieces/purple-settlement.png',
    city: '/icon/pieces/purple-city.png',
    road: '/icon/pieces/purple-road.png',
  },
};

/** Natural pixel aspect ratio (width / height) of each extracted piece crop. */
export const PIECE_ASPECT: { settlement: number; city: number; road: number } = {
  settlement: 224 / 233,
  city: 244 / 259,
  road: 706 / 136,
};

/**
 * Override aspect ratios for colors whose art wasn't cropped to the same
 * tight-cutout convention as the original 4 (see the comment on PLAYER_PIECE_ART).
 * Green/purple's roads are recolored from the same source art as the other 4
 * colors (see PLAYER_PIECE_ART's comment), so they need no override here — only
 * their settlement/city pieces, sourced from icon_new.png, have different
 * proportions.
 */
export const PIECE_ASPECT_OVERRIDE: Partial<
  Record<PlayerColor, Partial<{ settlement: number; city: number; road: number }>>
> = {
  green: { settlement: 244 / 282, city: 245 / 294 },
  purple: { settlement: 244 / 283, city: 245 / 294 },
};

export const ROBBER_ART = '/icon/pieces/robber.webp';
export const ROBBER_ASPECT = 219 / 430;
