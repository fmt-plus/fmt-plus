// Icons: 24-unit grid, round joins, currentColor. The X logo keeps its standard shape; wallets show their own icon.
import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement> & { size?: number };
const base = (size = 20) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
});

export const IconX = ({ size = 18, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

export const IconGitHub = ({ size = 18, ...p }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...p}>
    <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.42-2.7 5.39-5.27 5.68.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5z" />
  </svg>
);

export const IconCopy = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="8.5" y="8.5" width="12" height="12" rx="3.2" />
    <path d="M15.5 8.5V6.2a2.7 2.7 0 0 0-2.7-2.7H6.2a2.7 2.7 0 0 0-2.7 2.7v6.6a2.7 2.7 0 0 0 2.7 2.7h2.3" />
  </svg>
);

export const IconOut = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M9 5h10v10" />
    <path d="M19 5 6 18" />
  </svg>
);

export const IconShare = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 15V3.5" />
    <path d="m7.5 8 4.5-4.5L16.5 8" />
    <path d="M5 12.5v4.8A2.7 2.7 0 0 0 7.7 20h8.6a2.7 2.7 0 0 0 2.7-2.7v-4.8" />
  </svg>
);

export const IconCheck = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export const IconClose = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);

export const IconHome = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5H15v-6h-6v6H5.5A1.5 1.5 0 0 1 4 19z" />
  </svg>
);

export const IconDocs = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M6.5 3.5h7.5l4.5 4.5v10.8a1.7 1.7 0 0 1-1.7 1.7H6.5a1.7 1.7 0 0 1-1.7-1.7V5.2a1.7 1.7 0 0 1 1.7-1.7z" />
    <path d="M13.5 3.5V8.5h5M8.5 13h7M8.5 16.5h5" />
  </svg>
);

export const IconWallet = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z" />
    <path d="M15.5 12h.01M4 9h16" />
  </svg>
);

export const IconDownload = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 4v11" />
    <path d="m7.5 10.5 4.5 4.5 4.5-4.5" />
    <path d="M5 19.5h14" />
  </svg>
);

export const IconLink = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1.2 1.2" />
    <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1.2-1.2" />
  </svg>
);

export const IconChart = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 19.5h16" />
    <path d="m5.5 15 4-4.5 3.5 3 5.5-6.5" />
  </svg>
);

export const IconSearch = ({ size, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="10.8" cy="10.8" r="6.3" />
    <path d="m15.5 15.5 4 4" />
  </svg>
);
