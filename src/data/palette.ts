import type {
  BackdropThemeId,
  ColourGroup,
  PaletteCollection,
  PartColours,
  Swatch,
} from '../types';

export const CLASSIC_SWATCHES: Swatch[] = [
  // Neutrals (7)
  { name: 'Optic White', hex: '#F5F5F2', family: 'Classics' },
  { name: 'Off-White', hex: '#EBE7DE', family: 'Classics' },
  { name: 'Stone', hex: '#D3CEC4', family: 'Classics' },
  { name: 'Beige', hex: '#C5B6A2', family: 'Classics' },
  { name: 'Heather Grey', hex: '#9A9D9F', family: 'Classics' },
  { name: 'Charcoal', hex: '#3A3C3F', family: 'Classics' },
  { name: 'Jet Black', hex: '#1B1C1E', family: 'Classics' },
  // Blues (5)
  { name: 'Sky Blue', hex: '#9AC1DC', family: 'Classics' },
  { name: 'Slate Blue', hex: '#5D7B9B', family: 'Classics' },
  { name: 'Royal Blue', hex: '#254C9A', family: 'Classics' },
  { name: 'Navy', hex: '#1C2942', family: 'Classics' },
  { name: 'Teal', hex: '#1F626A', family: 'Classics' },
  // Greens (5)
  { name: 'Mint', hex: '#A7CEBC', family: 'Classics' },
  { name: 'Sage', hex: '#7A9280', family: 'Classics' },
  { name: 'Olive', hex: '#5B6342', family: 'Classics' },
  { name: 'Forest', hex: '#214734', family: 'Classics' },
  { name: 'Bottle Green', hex: '#143327', family: 'Classics' },
  // Warm (7)
  { name: 'Maroon', hex: '#5C1E2A', family: 'Classics' },
  { name: 'Burgundy', hex: '#792534', family: 'Classics' },
  { name: 'Crimson Red', hex: '#B5262E', family: 'Classics' },
  { name: 'Terracotta', hex: '#B4543B', family: 'Classics' },
  { name: 'Burnt Orange', hex: '#D46028', family: 'Classics' },
  { name: 'Mustard', hex: '#C6922B', family: 'Classics' },
  { name: 'Marigold Yellow', hex: '#E5BC41', family: 'Classics' },
  // Others (6)
  { name: 'Camel', hex: '#9D7551', family: 'Classics' },
  { name: 'Espresso Brown', hex: '#4B3628', family: 'Classics' },
  { name: 'Plum', hex: '#4D2A4A', family: 'Classics' },
  { name: 'Royal Purple', hex: '#5B3D7B', family: 'Classics' },
  { name: 'Dusty Pink', hex: '#C98D99', family: 'Classics' },
  { name: 'Rose Pink', hex: '#D86F87', family: 'Classics' },
];

export const PALETTE_COLLECTIONS: PaletteCollection[] = [
  {
    id: 'corporate',
    label: 'Corporate',
    swatches: [
      { name: 'Executive Navy', hex: '#18263F', family: 'Corporate' },
      { name: 'Slate', hex: '#4A5563', family: 'Corporate' },
      { name: 'Graphite', hex: '#2E3136', family: 'Corporate' },
      { name: 'Steel Blue', hex: '#4B6B8A', family: 'Corporate' },
      { name: 'Oxford Blue', hex: '#243B5E', family: 'Corporate' },
      { name: 'Pewter', hex: '#7E848C', family: 'Corporate' },
      { name: 'Silver Mist', hex: '#C5C9CE', family: 'Corporate' },
      { name: 'Ivory', hex: '#F0ECE3', family: 'Corporate' },
      { name: 'Crisp White', hex: '#F5F5F2', family: 'Corporate' },
    ],
  },
  {
    id: 'indian-uniforms',
    label: 'Indian Uniforms',
    swatches: [
      { name: 'Maroon', hex: '#5E1B28', family: 'Indian Uniforms' },
      { name: 'Bottle Green', hex: '#14382A', family: 'Indian Uniforms' },
      { name: 'Royal Blue', hex: '#1F4999', family: 'Indian Uniforms' },
      { name: 'Khaki', hex: '#B49F78', family: 'Indian Uniforms' },
      { name: 'Sky Blue', hex: '#88B8DA', family: 'Indian Uniforms' },
      { name: 'Optic White', hex: '#F5F5F2', family: 'Indian Uniforms' },
      { name: 'Charcoal', hex: '#383A3D', family: 'Indian Uniforms' },
      { name: 'Navy', hex: '#1C2942', family: 'Indian Uniforms' },
      { name: 'Hospital Teal', hex: '#1F6D72', family: 'Indian Uniforms' },
      { name: 'House Mustard', hex: '#C89226', family: 'Indian Uniforms' },
    ],
  },
  {
    id: 'earth',
    label: 'Earth',
    swatches: [
      { name: 'Olive', hex: '#59613F', family: 'Earth' },
      { name: 'Clay', hex: '#A5614B', family: 'Earth' },
      { name: 'Sand', hex: '#D4C5AE', family: 'Earth' },
      { name: 'Terracotta', hex: '#B8523A', family: 'Earth' },
      { name: 'Moss', hex: '#41553B', family: 'Earth' },
      { name: 'Ochre', hex: '#B88332', family: 'Earth' },
      { name: 'Bark', hex: '#4C392C', family: 'Earth' },
      { name: 'Warm Stone', hex: '#C4BBB0', family: 'Earth' },
      { name: 'Sage', hex: '#7D9280', family: 'Earth' },
    ],
  },
  {
    id: 'bold',
    label: 'Bold',
    swatches: [
      { name: 'Cobalt', hex: '#1D46A6', family: 'Bold' },
      { name: 'Crimson', hex: '#B41F2C', family: 'Bold' },
      { name: 'Emerald', hex: '#166F4B', family: 'Bold' },
      { name: 'Saffron', hex: '#DC7D1E', family: 'Bold' },
      { name: 'Magenta', hex: '#9E245E', family: 'Bold' },
      { name: 'Tangerine', hex: '#D95326', family: 'Bold' },
      { name: 'Royal Violet', hex: '#54357A', family: 'Bold' },
      { name: 'Deep Cyan', hex: '#156A78', family: 'Bold' },
      { name: 'Canary', hex: '#E6B828', family: 'Bold' },
    ],
  },
  {
    id: 'pastel',
    label: 'Pastel',
    swatches: [
      { name: 'Powder Blue', hex: '#B9D0E3', family: 'Pastel' },
      { name: 'Blush', hex: '#E3C2C7', family: 'Pastel' },
      { name: 'Mint Frost', hex: '#B9DAC9', family: 'Pastel' },
      { name: 'Butter', hex: '#EFE1B2', family: 'Pastel' },
      { name: 'Lavender', hex: '#CBC2DC', family: 'Pastel' },
      { name: 'Peach', hex: '#E8C5B4', family: 'Pastel' },
      { name: 'Seafoam', hex: '#B8D4D1', family: 'Pastel' },
      { name: 'Oat Milk', hex: '#E7E0D3', family: 'Pastel' },
    ],
  },
  {
    id: 'monochrome',
    label: 'Monochrome',
    swatches: [
      { name: 'Optic White', hex: '#F5F5F2', family: 'Monochrome' },
      { name: 'Alabaster', hex: '#E8E6E1', family: 'Monochrome' },
      { name: 'Light Ash', hex: '#CECCC7', family: 'Monochrome' },
      { name: 'Silver Grey', hex: '#AEACA7', family: 'Monochrome' },
      { name: 'Mid Grey', hex: '#838381', family: 'Monochrome' },
      { name: 'Slate Grey', hex: '#5D5F62', family: 'Monochrome' },
      { name: 'Charcoal', hex: '#3B3D40', family: 'Monochrome' },
      { name: 'Anthracite', hex: '#26282B', family: 'Monochrome' },
      { name: 'Jet Black', hex: '#191A1C', family: 'Monochrome' },
    ],
  },
  {
    id: 'classics',
    label: 'Classics',
    swatches: CLASSIC_SWATCHES,
  },
];

export const ALL_NAMED_SWATCHES: Swatch[] = [
  ...CLASSIC_SWATCHES,
  ...PALETTE_COLLECTIONS.filter((c) => c.id !== 'classics').flatMap((c) => c.swatches),
  { name: 'Horn Brown', hex: '#5C4330', family: 'Buttons' },
  { name: 'Gunmetal', hex: '#4B4F55', family: 'Buttons' },
];

export const BUTTON_PRESETS: Array<{ id: string; label: string; hex?: string }> = [
  { id: 'white', label: 'White', hex: '#F0EFEA' },
  { id: 'black', label: 'Black', hex: '#1F2022' },
  { id: 'horn', label: 'Horn', hex: '#5C4330' },
  { id: 'gunmetal', label: 'Gunmetal', hex: '#4B4F55' },
  { id: 'matching', label: 'Match body' },
];

export interface BackdropThemeConfig {
  id: BackdropThemeId;
  label: string;
  swatchHex: string;
  centerHex: string;
  edgeHex: string;
  flatExportHex: string;
  isDark: boolean;
}

export const BACKDROP_THEMES: BackdropThemeConfig[] = [
  {
    id: 'studio',
    label: 'Studio',
    swatchHex: '#F4F3F0',
    centerHex: '#F8F7F4',
    edgeHex: '#E7E4DC',
    flatExportHex: '#F4F3F0',
    isDark: false,
  },
  {
    id: 'sand',
    label: 'Sand',
    swatchHex: '#E5DDD0',
    centerHex: '#ECE5D8',
    edgeHex: '#D5C9B6',
    flatExportHex: '#E6DED0',
    isDark: false,
  },
  {
    id: 'sage',
    label: 'Sage',
    swatchHex: '#D5DDD3',
    centerHex: '#DFE6DD',
    edgeHex: '#C2CCC0',
    flatExportHex: '#D7DFD5',
    isDark: false,
  },
  {
    id: 'slate',
    label: 'Slate',
    swatchHex: '#C7CFD7',
    centerHex: '#D4DBE2',
    edgeHex: '#AEB8C2',
    flatExportHex: '#C9D1D9',
    isDark: false,
  },
  {
    id: 'charcoal',
    label: 'Charcoal',
    swatchHex: '#2C2E31',
    centerHex: '#3B3D41',
    edgeHex: '#1F2124',
    flatExportHex: '#2C2E31',
    isDark: true,
  },
];

export function getBackdropTheme(id: BackdropThemeId): BackdropThemeConfig {
  return BACKDROP_THEMES.find((t) => t.id === id) ?? BACKDROP_THEMES[0];
}

export const DEFAULT_PART_COLOURS: PartColours = {
  body: '#1C2942', // Navy
  sleeves: '#1C2942',
  collar: '#1C2942',
  placket: '#1C2942',
  buttons: '#3A3C3F',
  pocket: '#1C2942',
};

export const COLOUR_GROUP_LABELS: Record<ColourGroup, string> = {
  body: 'Body',
  sleeves: 'Sleeves',
  collar: 'Collar',
  placket: 'Placket',
  buttons: 'Buttons',
  pocket: 'Pocket',
};

export const COLOUR_GROUPS: ColourGroup[] = [
  'body',
  'sleeves',
  'collar',
  'placket',
  'buttons',
  'pocket',
];
