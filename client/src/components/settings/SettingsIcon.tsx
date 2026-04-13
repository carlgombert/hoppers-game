import * as React from 'react';

// This component simply renders the new settings2.svg inline, unstyled.
// You can add props if you want to control size, etc.
import settings2 from '../../assets/settings2.svg';

export default function SettingsIcon(props: React.HTMLAttributes<HTMLSpanElement>) {
  return (
    <span {...props}>
      <img src={settings2} alt="Settings" />
    </span>
  );
}
