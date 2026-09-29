// Circuit silhouettes simplified from public GPS traces (OSM), not official maps.

const TRACKS: Record<string, { viewBox: string; d: string }> = {
  "2023_Monza": {
    viewBox: "0 0 280 160",
    d: "M 98.3 139.8 L 168.2 142.0 L 171.6 137.3 L 186.0 142.4 L 206.3 143.7 L 216.2 142.1 L 224.4 138.2 L 232.4 130.9 L 240.2 117.3 L 250.3 67.5 L 255.4 65.2 L 269.2 34.2 L 269.9 29.1 L 268.4 25.6 L 263.3 22.1 L 233.8 16.8 L 206.0 54.1 L 149.7 104.2 L 139.3 103.1 L 127.3 109.5 L 18.4 108.1 L 12.8 110.7 L 10.1 115.9 L 13.1 126.5 L 18.3 131.3 L 25.3 134.7 L 54.9 139.2 Z",
  },
  "2023_Singapore": {
    viewBox: "0 0 280 160",
    d: "M 243.3 63.3 L 248.0 100.4 L 239.1 114.2 L 198.0 110.6 L 195.1 108.2 L 193.4 99.9 L 128.9 96.5 L 120.0 94.9 L 93.3 73.1 L 89.8 73.2 L 87.4 75.1 L 84.6 83.5 L 72.0 147.4 L 69.9 149.7 L 67.2 150.0 L 61.6 142.1 L 46.9 128.5 L 45.6 124.1 L 46.6 117.6 L 39.2 114.2 L 32.5 107.9 L 32.0 103.0 L 60.4 52.1 L 66.6 48.7 L 72.6 52.7 L 86.5 67.3 L 88.8 67.6 L 102.5 42.7 L 105.2 40.2 L 154.2 67.1 L 213.6 71.1 L 218.5 69.4 L 222.2 65.1 L 222.2 56.6 L 213.2 27.1 L 214.0 15.3 L 217.3 10.2 L 220.4 10.4 L 223.7 14.6 L 228.7 17.5 L 235.3 18.0 L 238.1 20.1 Z",
  },
  "2023_Spain": {
    viewBox: "0 0 280 160",
    d: "M 95.9 117.9 L 231.5 117.4 L 235.0 113.2 L 235.8 102.6 L 238.0 98.0 L 242.2 94.7 L 258.2 88.6 L 265.5 82.5 L 269.6 73.6 L 269.3 64.5 L 262.5 52.5 L 254.6 46.9 L 245.4 43.5 L 236.4 41.8 L 186.2 42.2 L 181.4 45.9 L 179.7 52.5 L 183.0 61.7 L 188.8 66.3 L 194.1 68.7 L 202.4 69.6 L 234.5 69.4 L 239.1 72.2 L 240.3 76.6 L 237.8 81.2 L 209.3 99.4 L 196.3 102.7 L 177.1 102.8 L 170.7 100.1 L 167.1 81.9 L 145.9 51.2 L 136.7 45.6 L 125.3 47.1 L 40.1 96.4 L 36.7 95.3 L 34.4 92.0 L 35.0 82.0 L 40.8 73.4 L 55.4 66.9 L 59.8 62.4 L 60.5 54.5 L 58.0 50.2 L 51.8 46.6 L 46.3 47.0 L 19.6 55.8 L 15.2 58.6 L 11.4 63.5 L 10.0 68.6 L 10.4 103.6 L 12.9 109.9 L 16.7 114.0 L 23.1 117.4 L 29.1 118.0 Z",
  },
};

const FALLBACK = {
  viewBox: "0 0 280 160",
  d: "M56 80 A84 44 0 1 0 56.1 80",
};

export default function TrackOutline({
  raceId,
  className,
}: {
  raceId: string;
  className?: string;
}) {
  const track = TRACKS[raceId] ?? FALLBACK;
  return (
    <svg
      className={className}
      viewBox={track.viewBox}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d={track.d}
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}
