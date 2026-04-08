import ChromeIcon from '../ChromeIcon';
import SvgIcon from '../SvgIcon';
import { type Level } from '../../types/level';

interface Props {
  levels: Level[];
  loading?: boolean;
  onPlay: (level: Level) => void;
  onEdit: (level: Level) => void;
  onDelete: (id: string) => void;
  onCreateNew: () => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export default function MyLevels({ levels, loading, onPlay, onEdit, onDelete, onCreateNew }: Props) {
  return (
    <div className="xp-levels-layout">
      {/* Toolbar */}
      <div className="xp-levels-toolbar">
        <span className="xp-levels-count">
          {levels.length} {levels.length === 1 ? 'level' : 'levels'}
        </span>
        <div className="xp-levels-toolbar-spacer" />
        <button type="button" className="xp-btn primary" onClick={onCreateNew}>
          + Create New Level
        </button>
      </div>

      {/* Loading state */}
      {loading && levels.length === 0 && (
        <div className="xp-levels-empty">
          <p className="xp-levels-empty-title">Loading levels…</p>
        </div>
      )}

      {/* Empty state */}
      {!loading && levels.length === 0 && (
        <div className="xp-levels-empty">
          <ChromeIcon variant="levels" className="xp-levels-empty-icon" size={48} />
          <p className="xp-levels-empty-title">No levels yet</p>
          <p className="xp-levels-empty-sub">
            Build your first level in the editor to play it here.
          </p>
          <button type="button" className="xp-btn primary" onClick={onCreateNew}>
            Open Level Editor
          </button>
        </div>
      )}

      {/* Level cards */}
      {levels.length > 0 && (
        <div className="xp-levels-grid">
          {levels.map((level) => (
            <div key={level.id} className="xp-level-card">
              {/* Thumbnail area */}
              <div className="xp-level-card-thumb">
                <span className="xp-level-card-tile-count">
                  {level.tile_data.length} tiles
                </span>
                {level.published ? (
                  <span className="xp-level-badge published">Published</span>
                ) : (
                  <span className="xp-level-badge draft">Draft</span>
                )}
              </div>

              {/* Card body */}
              <div className="xp-level-card-body">
                <div className="xp-level-card-title">{level.title || 'Untitled Level'}</div>
                {level.description && (
                  <div className="xp-level-card-desc">{level.description}</div>
                )}
                <div className="xp-level-card-meta">
                  Updated {formatDate(level.updated_at)}
                </div>
              </div>

              {/* Actions */}
              <div className="xp-level-card-actions">
                <button
                  type="button"
                  className="xp-btn primary xp-level-play-btn"
                  onClick={() => onPlay(level)}
                >
                  <SvgIcon name="play" size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Play
                </button>
                <button
                  type="button"
                  className="xp-btn ghost"
                  onClick={() => onEdit(level)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="xp-btn danger"
                  onClick={() => {
                    if (window.confirm(`Delete "${level.title || 'Untitled Level'}"?`)) {
                      onDelete(level.id);
                    }
                  }}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
