import { useState, useEffect, useCallback } from 'react';
import ChromeIcon from '../ChromeIcon';
import SvgIcon from '../SvgIcon';
import {
  fetchPublishedLevels,
  forkLevel,
  fetchLeaderboard,
  type PublishedLevel,
  type LeaderboardEntry,
} from '../../api/client';
import { type Level } from '../../types/level';

interface Props {
  onPlay: (level: Level) => void;
}

function formatTime(ms: number) {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const centis = Math.floor((ms % 1000) / 10);
  return `${min}:${sec.toString().padStart(2, '0')}.${centis.toString().padStart(2, '0')}`;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
}

export default function CommunityBrowse({ onPlay }: Props) {
  const [levels, setLevels] = useState<PublishedLevel[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [forking, setForking] = useState<string | null>(null);
  const [forkSuccess, setForkSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Leaderboard panel
  const [lbLevel, setLbLevel] = useState<PublishedLevel | null>(null);
  const [lbEntries, setLbEntries] = useState<LeaderboardEntry[]>([]);
  const [lbLoading, setLbLoading] = useState(false);

  const load = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchPublishedLevels(p);
      setLevels(data.levels);
      setTotal(data.total);
      setPage(data.page);
    } catch {
      setError('Failed to load community levels.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1); }, [load]);

  async function handleFork(id: string, title: string) {
    setForking(id);
    try {
      await forkLevel(id);
      setForkSuccess(`"${title}" was added to your levels.`);
      setTimeout(() => setForkSuccess(null), 3000);
    } catch {
      setError('Failed to fork level.');
    } finally {
      setForking(null);
    }
  }

  async function openLeaderboard(level: PublishedLevel) {
    setLbLevel(level);
    setLbLoading(true);
    try {
      const entries = await fetchLeaderboard(level.id);
      setLbEntries(entries);
    } catch {
      setLbEntries([]);
    } finally {
      setLbLoading(false);
    }
  }

  const totalPages = Math.ceil(total / 20);

  return (
    <div className="xp-community-layout">
      {/* Toolbar */}
      <div className="xp-levels-toolbar">
        <span className="xp-levels-count">
          {total} published {total === 1 ? 'level' : 'levels'}
        </span>
        <div className="xp-levels-toolbar-spacer" />
        <button type="button" className="xp-btn ghost" onClick={() => load(page)}>
          Refresh
        </button>
      </div>

      {forkSuccess && (
        <div className="xp-community-notice">{forkSuccess}</div>
      )}
      {error && (
        <div className="xp-community-error">{error}</div>
      )}

      {/* Loading / empty state */}
      {loading && levels.length === 0 && (
        <div className="xp-levels-empty">
          <p className="xp-levels-empty-title">Loading levels…</p>
        </div>
      )}
      {!loading && levels.length === 0 && (
        <div className="xp-levels-empty">
          <ChromeIcon variant="browse" className="xp-levels-empty-icon" size={48} />
          <p className="xp-levels-empty-title">No published levels yet</p>
          <p className="xp-levels-empty-sub">
            Be the first! Build and publish a level to share with the community.
          </p>
        </div>
      )}

      {/* Level grid */}
      {levels.length > 0 && (
        <div className="xp-levels-grid">
          {levels.map((level) => (
            <div key={level.id} className="xp-level-card">
              {/* Thumbnail */}
              <div className="xp-level-card-thumb">
                {level.thumbnail ? (
                  <img
                    src={level.thumbnail}
                    alt={level.title}
                    className="xp-level-card-thumb-img"
                  />
                ) : (
                  <span className="xp-level-card-tile-count">No preview</span>
                )}
                <span className="xp-level-badge published">Community</span>
              </div>

              {/* Body */}
              <div className="xp-level-card-body">
                <div className="xp-level-card-title">{level.title || 'Untitled'}</div>
                {level.description && (
                  <div className="xp-level-card-desc">{level.description}</div>
                )}
                <div className="xp-level-card-meta">
                  By {level.author} &ndash; {formatDate(level.created_at)}
                </div>
              </div>

              {/* Actions */}
              <div className="xp-level-card-actions">
                <button
                  type="button"
                  className="xp-btn primary xp-level-play-btn"
                  onClick={() =>
                    onPlay({
                      id: level.id,
                      title: level.title,
                      description: level.description ?? '',
                      tile_data: [],
                      published: true,
                      created_at: level.created_at,
                      updated_at: level.created_at,
                    })
                  }
                >
                  <SvgIcon name="play" size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Play
                </button>
                <button
                  type="button"
                  className="xp-btn ghost"
                  onClick={() => openLeaderboard(level)}
                >
                  <SvgIcon name="trophy" size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  Scores
                </button>
                <button
                  type="button"
                  className="xp-btn ghost"
                  disabled={forking === level.id}
                  onClick={() => handleFork(level.id, level.title)}
                >
                  <SvgIcon name="fork" size={12} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                  {forking === level.id ? 'Forking...' : 'Fork'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="xp-community-pagination">
          <button
            type="button"
            className="xp-btn ghost"
            disabled={page <= 1}
            onClick={() => load(page - 1)}
          >
            <SvgIcon name="prev-page" size={14} style={{ verticalAlign: 'middle' }} />
            {' '}Prev
          </button>
          <span className="xp-community-page-info">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="xp-btn ghost"
            disabled={page >= totalPages}
            onClick={() => load(page + 1)}
          >
            Next{' '}
            <SvgIcon name="next-page" size={14} style={{ verticalAlign: 'middle' }} />
          </button>
        </div>
      )}

      {/* Leaderboard panel */}
      {lbLevel && (
        <div className="xp-lb-overlay" onClick={() => setLbLevel(null)}>
          <div className="xp-lb-panel" onClick={(e) => e.stopPropagation()}>
            <div className="xp-lb-titlebar">
              <span className="xp-lb-title">Leaderboard &ndash; {lbLevel.title}</span>
              <button type="button" className="xp-lb-close" onClick={() => setLbLevel(null)} aria-label="Close">
                <SvgIcon name="close" size={14} />
              </button>
            </div>
            <div className="xp-lb-body">
              {lbLoading && <p className="xp-lb-empty">Loading...</p>}
              {!lbLoading && lbEntries.length === 0 && (
                <p className="xp-lb-empty">No completions yet.</p>
              )}
              {!lbLoading && lbEntries.length > 0 && (
                <ol className="xp-lb-list">
                  {lbEntries.map((e, i) => (
                    <li key={i} className="xp-lb-row">
                      <span className="xp-lb-rank">{i + 1}.</span>
                      <span className="xp-lb-name">{e.display_name}</span>
                      <span className="xp-lb-time">{formatTime(e.elapsed_ms)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
