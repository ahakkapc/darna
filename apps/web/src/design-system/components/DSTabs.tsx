'use client';

import { ReactNode } from 'react';
import MuiTabs from '@mui/material/Tabs';
import MuiTab from '@mui/material/Tab';
import Badge from '@mui/material/Badge';
import { colors } from '../tokens';

interface DSTabItem {
  label: string;
  count?: number;
}

interface DSTabsProps {
  value: number;
  onChange: (index: number) => void;
  items: DSTabItem[];
  className?: string;
}

export default function DSTabs({ value, onChange, items, className }: DSTabsProps) {
  return (
    <MuiTabs
      value={value}
      onChange={(_, v) => onChange(v)}
      className={className}
      sx={{
        minHeight: 40,
        borderBottom: `1px solid ${colors.border[0]}`,
        '& .MuiTab-root': { minHeight: 40 },
      }}
    >
      {items.map((item, i) => (
        <MuiTab
          key={i}
          label={
            item.count != null ? (
              <Badge
                badgeContent={item.count}
                color="primary"
                max={99}
                sx={{ '& .MuiBadge-badge': { fontSize: 10, height: 18, minWidth: 18, right: -12, top: 2 } }}
              >
                {item.label}
              </Badge>
            ) : (
              item.label
            )
          }
        />
      ))}
    </MuiTabs>
  );
}
