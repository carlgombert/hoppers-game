import { type Level } from '../../types/level';
import { type PublishedLevel } from '../../api/client';
import purpleGradient from '../../assets/purple_gradient.jpg';

// Import avatars for mapping
import avatar1 from '../../assets/avatars/1.jpeg';
import avatar2 from '../../assets/avatars/2.jpeg';
import avatar3 from '../../assets/avatars/3.jpeg';
import avatar4 from '../../assets/avatars/4.jpeg';
import avatar5 from '../../assets/avatars/5.jpeg';
import avatar6 from '../../assets/avatars/6.jpeg';
import avatar7 from '../../assets/avatars/7.jpeg';
import avatar8 from '../../assets/avatars/8.jpeg';
import avatar9 from '../../assets/avatars/9.jpeg';
import avatar10 from '../../assets/avatars/10.jpeg';
import avatar11 from '../../assets/avatars/11.jpeg';
import avatar12 from '../../assets/avatars/12.jpeg';

const AVATARS = [
  avatar1, avatar2, avatar3, avatar4, avatar5, avatar6,
  avatar7, avatar8, avatar9, avatar10, avatar11, avatar12
];

interface Props {
  level: Level | PublishedLevel;
  isOwner: boolean;
  currentUserAvatarId?: number;
  onBack: () => void;
  onPlay: (level: any) => void;
  onEdit?: (level: Level) => void;
  onCopy?: (level: PublishedLevel) => void;
  onLeaderboard?: (level: PublishedLevel) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function LevelDetails({
  level,
  isOwner,
  currentUserAvatarId,
  onBack,
  onPlay,
  onEdit,
  onCopy,
  onLeaderboard,
}: Props) {
  const authorName = 'author' in level ? level.author : (isOwner ? 'You' : 'Unknown');
  const isPublished = 'published' in level ? level.published : true;
  const tileData = 'tile_data' in level ? level.tile_data : null;
  const tileCount = tileData ? tileData.length : null;

  // Resolve avatar: Use user's avatar if owner, otherwise default for community
  const avatarIndex = (isOwner && currentUserAvatarId !== undefined) 
    ? (currentUserAvatarId - 1) 
    : 0;
  const profileAvatar = AVATARS[Math.max(0, Math.min(avatarIndex, AVATARS.length - 1))];

  return (
    <div className="xp-level-details">
      {/* Header / Breadcrumb */}
      <div className="xp-details-header">
        <button type="button" className="xp-details-back-btn" onClick={onBack}>
          Back to list
        </button>
      </div>

      <div className="xp-details-grid">
        {/* Main Column: Hero & Description */}
        <div className="xp-details-main">
          <div className="xp-details-hero">
            <img src={purpleGradient} alt="Level Thumbnail" className="xp-details-hero-img" />
            <div className="xp-details-hero-overlay">
              <button 
                type="button" 
                className="xp-btn primary xp-details-play-btn"
                onClick={() => onPlay(level)}
              >
                Play Level
              </button>
            </div>
          </div>

          <div className="xp-details-section">
            <h2 className="xp-details-h2">Description</h2>
            <div className="xp-details-desc-box">
              <p className="xp-details-desc">
                {level.description || 'No description provided for this level.'}
              </p>
            </div>
          </div>
        </div>

        {/* Sidebar: Creator, Stats & Actions */}
        <div className="xp-details-sidebar">
          {/* Creator Card */}
          <div className="xp-details-section">
            <h2 className="xp-details-h2">Creator</h2>
            <div className="xp-creator-card">
              <div className="xp-creator-avatar">
                <img src={profileAvatar} alt={authorName} className="xp-creator-img" />
              </div>
              <div className="xp-creator-info">
                <div className="xp-creator-name">{authorName}</div>
                <div className="xp-creator-date">Member since {formatDate(level.created_at)}</div>
              </div>
            </div>
          </div>

          <div className="xp-details-section">
            <h2 className="xp-details-h2">Level Info</h2>
            <div className="xp-details-stats-card">
              <div className="xp-details-stat-row">
                <span className="xp-details-stat-label">Status</span>
                <span className={`xp-level-badge ${isPublished ? 'published' : 'draft'}`}>
                  {isPublished ? 'Published' : 'Draft'}
                </span>
              </div>
              <div className="xp-details-stat-row">
                <span className="xp-details-stat-label">Map</span>
                <span className="xp-details-stat-value" style={{ textTransform: 'capitalize' }}>
                  {level.backdrop_id || 'Default'}
                </span>
              </div>
              {tileCount !== null && (
                <div className="xp-details-stat-row">
                  <span className="xp-details-stat-label">Complexity</span>
                  <span className="xp-details-stat-value">{tileCount} Tiles</span>
                </div>
              )}
              <div className="xp-details-stat-row">
                <span className="xp-details-stat-label">Last Updated</span>
                <span className="xp-details-stat-value">
                  {formatDate('updated_at' in level ? level.updated_at : level.created_at)}
                </span>
              </div>
            </div>
          </div>

          <div className="xp-details-section">
            <h2 className="xp-details-h2">Actions</h2>
            <div className="xp-details-actions-stack">
              {isOwner && onEdit && 'tile_data' in level && (
                <button 
                  type="button" 
                  className="xp-btn ghost xp-details-action"
                  onClick={() => onEdit(level as Level)}
                >
                  Edit Level
                </button>
              )}
              {!isOwner && onCopy && (
                <button 
                  type="button" 
                  className="xp-btn ghost xp-details-action"
                  onClick={() => onCopy(level as PublishedLevel)}
                >
                  Copy to My Levels
                </button>
              )}
              {onLeaderboard && (
                <button 
                  type="button" 
                  className="xp-btn ghost xp-details-action"
                  onClick={() => onLeaderboard(level as PublishedLevel)}
                >
                  View Leaderboard
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
