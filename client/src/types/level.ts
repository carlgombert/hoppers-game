export type TileType =
  | 'land'
  | 'grass'
  | 'demon_grass'
  | 'water'
  | 'lava'
  | 'ice'
  | 'boombox'
  | 'moving_box'
  | 'falling_land'
  | 'ladder'
  | 'portal'
  | 'laser'
  | 'flag_start'
  | 'flag_checkpoint'
  | 'flag_finish';

export type EditorTool = TileType | 'eraser' | 'glue';

export interface Tile {
  type: TileType;
  x: number; // grid column index
  y: number; // grid row index
  waterVariant?: 'still' | 'flow';
  moveDirection?: 'left' | 'right' | 'up' | 'right' | 'down';
  linkedPortalId?: string;
  direction?: 'h' | 'v'; // laser direction
  glue?: {
    up?: boolean;
    down?: boolean;
    left?: boolean;
    right?: boolean;
  };
}

export interface Level {
  id: string;
  title: string;
  description: string;
  backdrop_id: string;
  tile_data: Tile[];
  published: boolean;
  created_at: string;
  updated_at: string;
}

export interface TileMeta {
  label: string;
  color: string;
  gloss: string; // highlight color for bevel
  category: string;
}

export const TILE_META: Record<TileType, TileMeta> = {
  land:            { label: 'Land',         color: '#4a7fc8', gloss: '#7ab4e8', category: 'Platforms' },
  grass:           { label: 'Grass',        color: '#4e7a44', gloss: '#78b068', category: 'Platforms' },
  demon_grass:     { label: 'Demon Grass',  color: '#7a3858', gloss: '#b0607c', category: 'Platforms' },
  ice:             { label: 'Ice',          color: '#8ac4d8', gloss: '#c0e4f4', category: 'Platforms' },
  falling_land:    { label: 'Falling Land', color: '#886030', gloss: '#b89060', category: 'Platforms' },
  ladder:          { label: 'Ladder',       color: '#b89820', gloss: '#e0c050', category: 'Platforms' },
  moving_box:      { label: 'Moving Box',   color: '#7040a0', gloss: '#a878d0', category: 'Dynamic'  },
  water:           { label: 'Water',        color: '#2060b0', gloss: '#4898e0', category: 'Hazards'  },
  lava:            { label: 'Lava',         color: '#c04020', gloss: '#e87040', category: 'Hazards'  },
  boombox:         { label: 'Boombox',      color: '#b87020', gloss: '#e8a048', category: 'Hazards'  },
  laser:           { label: 'Laser',        color: '#c02840', gloss: '#e86080', category: 'Hazards'  },
  portal:          { label: 'Portal',       color: '#20a898', gloss: '#50d8cc', category: 'Special'  },
  flag_start:      { label: 'Start Flag',   color: '#2a9030', gloss: '#50c860', category: 'Flags'    },
  flag_checkpoint: { label: 'Checkpoint',   color: '#c8a020', gloss: '#f0d048', category: 'Flags'    },
  flag_finish:     { label: 'Finish Flag',  color: '#b82890', gloss: '#e068c0', category: 'Flags'    },
};

export const TILE_CATEGORIES: readonly string[] = [
  'Platforms',
  'Dynamic',
  'Hazards',
  'Special',
  'Flags',
];
