// Static imports for all 12 avatars so Vite bundles them correctly.
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

const AVATARS: Record<number, string> = {
  1: avatar1,
  2: avatar2,
  3: avatar3,
  4: avatar4,
  5: avatar5,
  6: avatar6,
  7: avatar7,
  8: avatar8,
  9: avatar9,
  10: avatar10,
  11: avatar11,
  12: avatar12,
};

export const AVATAR_COUNT = 12;

/** Returns the bundled image URL for the given avatar id (1–12). */
export function getAvatarSrc(avatarId: number): string {
  return AVATARS[avatarId] ?? avatar1;
}

interface AvatarPickerProps {
  selected: number | null;
  onChange: (id: number) => void;
  disabled?: boolean;
}

export default function AvatarPicker({ selected, onChange, disabled = false }: AvatarPickerProps) {
  return (
    <div className="xp-avatar-picker" role="radiogroup" aria-label="Choose an avatar">
      {Array.from({ length: AVATAR_COUNT }, (_, i) => i + 1).map((id) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={selected === id}
          aria-label={`Avatar ${id}`}
          disabled={disabled}
          onClick={() => onChange(id)}
          className={`xp-avatar-option${selected === id ? ' selected' : ''}`}
        >
          <img
            src={AVATARS[id]}
            alt={`Avatar ${id}`}
            className="xp-avatar-option-img"
            draggable={false}
          />
        </button>
      ))}
    </div>
  );
}
