import { TILE_META, TILE_CATEGORIES, type TileType, type EditorTool } from '../../types/level';

interface Props {
  selected: EditorTool;
  onSelect: (tool: EditorTool) => void;
  pendingPortalId: string | null;
}

export default function TilePalette({ selected, onSelect, pendingPortalId }: Props) {
  return (
    <div className="xp-palette">
      {/* Eraser */}
      <div className="xp-palette-group">
        <div className="xp-pane-heading">TOOLS</div>
        <button
          type="button"
          className={`xp-palette-tile${selected === 'eraser' ? ' active' : ''}`}
          onClick={() => onSelect('eraser')}
          title="Eraser (or right-click any cell)"
        >
          <span className="xp-palette-swatch xp-palette-swatch--eraser" />
          <span className="xp-palette-label">Eraser</span>
        </button>
        <button
          type="button"
          className={`xp-palette-tile${selected === 'glue' ? ' active' : ''}`}
          onClick={() => onSelect('glue')}
          title="Glue - Click tile edges to attach"
        >
          <span className="xp-palette-swatch" style={{ background: '#f0c040', border: '2px solid #b09020' }} />
          <span className="xp-palette-label">Glue</span>
        </button>
      </div>

      {/* Tile categories */}
      {TILE_CATEGORIES.map((cat) => {
        const entries = (Object.entries(TILE_META) as [TileType, (typeof TILE_META)[TileType]][])
          .filter(([, meta]) => meta.category === cat);
        return (
          <div key={cat} className="xp-palette-group">
            <div className="xp-pane-heading">{cat.toUpperCase()}</div>
            {entries.map(([type, meta]) => (
              <button
                key={type}
                type="button"
                className={`xp-palette-tile${selected === type ? ' active' : ''}${
                  type === 'portal' && pendingPortalId && selected === 'portal' ? ' xp-palette-tile--portal-pending' : ''
                }`}
                onClick={() => onSelect(type)}
                title={meta.label}
              >
                <span
                  className="xp-palette-swatch"
                  style={{ background: meta.color, boxShadow: `inset 0 1px 0 ${meta.gloss}40` }}
                />
                <span className="xp-palette-label">
                  {meta.label}
                  {type === 'portal' && pendingPortalId && selected === 'portal' && (
                    <span className="xp-palette-portal-hint"> - click 2nd</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        );
      })}
    </div>
  );
}
