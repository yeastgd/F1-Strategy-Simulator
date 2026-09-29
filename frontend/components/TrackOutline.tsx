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
  "2023_Bahrain": {
    viewBox: "0 0 280 160",
    d: "M 145.3 144.7 L 247.7 149.4 L 247.8 146.1 L 238.7 133.5 L 245.0 117.3 L 245.7 110.8 L 235.6 15.7 L 233.3 10.6 L 226.3 11.0 L 209.4 28.5 L 196.9 38.8 L 182.0 44.8 L 179.1 48.9 L 179.3 62.6 L 176.7 70.4 L 145.7 91.5 L 143.1 96.2 L 144.3 98.2 L 151.4 99.3 L 204.3 95.4 L 212.5 98.9 L 219.2 108.1 L 219.1 110.5 L 194.5 112.3 L 151.3 111.0 L 96.0 108.4 L 89.3 105.7 L 87.7 99.1 L 88.3 95.3 L 89.6 90.6 L 95.7 82.0 L 104.4 76.2 L 121.9 70.5 L 127.9 65.4 L 132.4 56.5 L 132.4 46.5 L 124.2 25.5 L 120.0 19.6 L 112.9 16.1 L 104.7 22.8 L 32.2 129.9 L 33.1 134.5 L 43.0 140.3 L 47.1 141.1 Z",
  },
  "2023_Silverstone": {
    viewBox: "0 0 280 160",
    d: "M 132.2 145.7 L 149.3 150.0 L 152.8 149.1 L 156.1 145.7 L 162.8 130.3 L 167.4 111.6 L 172.1 105.0 L 171.4 92.3 L 177.6 82.7 L 176.4 78.9 L 169.4 71.9 L 150.3 15.9 L 147.9 11.9 L 143.5 10.0 L 138.8 11.2 L 132.5 19.0 L 116.7 31.8 L 115.2 32.0 L 111.7 28.5 L 109.0 29.3 L 104.8 33.3 L 102.6 38.0 L 121.9 76.0 L 140.0 79.3 L 153.4 93.1 L 155.4 91.9 L 159.3 84.8 L 161.1 84.5 L 162.5 86.0 L 163.6 93.2 L 162.3 99.6 L 118.8 126.9 L 114.4 127.7 L 111.1 126.0 L 110.6 116.4 L 108.7 114.3 L 105.6 113.9 L 102.7 116.3 L 105.8 131.0 L 111.4 138.5 Z",
  },
  "2023_Suzuka": {
    viewBox: "0 0 280 160",
    d: "M 195.8 147.0 L 251.2 150.0 L 258.6 145.8 L 262.6 140.3 L 263.4 135.2 L 261.3 131.5 L 256.9 129.5 L 231.1 130.1 L 224.5 122.8 L 219.9 120.3 L 201.5 124.7 L 196.9 122.7 L 189.1 113.8 L 184.5 112.0 L 175.8 114.9 L 166.6 126.7 L 160.7 128.0 L 155.0 125.7 L 144.8 118.6 L 140.2 111.2 L 138.8 98.0 L 144.4 75.1 L 134.0 57.8 L 120.1 62.5 L 98.5 73.2 L 94.0 77.0 L 87.6 87.5 L 84.8 87.6 L 83.3 84.7 L 90.6 66.5 L 91.5 58.5 L 90.1 52.6 L 82.7 41.5 L 67.8 30.8 L 57.8 27.7 L 46.5 27.8 L 29.4 32.2 L 25.0 32.0 L 21.2 29.2 L 17.1 21.8 L 17.4 14.1 L 20.9 11.1 L 26.9 10.2 L 56.7 19.0 L 72.4 27.8 L 126.4 64.9 L 129.8 71.3 L 132.1 84.1 L 129.5 117.9 L 136.0 120.6 L 137.0 131.9 L 143.0 139.2 L 148.6 142.5 L 156.7 144.7 Z",
  },
  "2023_Baku": {
    viewBox: "0 0 280 160",
    d: "M 220.5 45.9 L 234.5 39.8 L 235.8 37.5 L 223.9 10.6 L 222.4 10.0 L 192.6 21.7 L 150.9 40.6 L 149.6 43.8 L 156.0 61.4 L 129.5 76.5 L 130.5 82.1 L 103.0 104.2 L 100.5 102.9 L 95.4 88.1 L 86.2 85.5 L 83.3 79.9 L 74.1 82.6 L 51.2 95.3 L 48.7 99.6 L 44.2 115.6 L 46.0 136.3 L 64.4 146.6 L 75.1 149.7 L 85.0 134.3 L 101.1 119.0 L 104.7 105.0 L 127.5 87.1 L 136.7 82.0 Z",
  },
};

const FALLBACK = {
  viewBox: "0 0 280 160",
  d: "M56 80 A84 44 0 1 0 56.1 80",
};

// Default: flip X (GPS Y-reflect mirrored the circuits). Baku/Singapore stay
// unflipped; Silverstone is flipped then rotated 90° clockwise.
const ORIENT: Record<string, { flipX?: boolean; rotate?: number }> = {
  "2023_Baku": { flipX: false },
  "2023_Singapore": { flipX: false },
  "2023_Silverstone": { flipX: true, rotate: 90 },
};

function trackTransform(raceId: string, width: number, height: number): string | undefined {
  const { flipX = true, rotate } = ORIENT[raceId] ?? {};
  const parts: string[] = [];
  if (rotate) {
    const cx = width / 2;
    const cy = height / 2;
    parts.push(`translate(${cx} ${cy}) rotate(${rotate}) translate(${-cx} ${-cy})`);
  }
  if (flipX) {
    parts.push(`translate(${width} 0) scale(-1 1)`);
  }
  return parts.length ? parts.join(" ") : undefined;
}

export default function TrackOutline({
  raceId,
  className,
}: {
  raceId: string;
  className?: string;
}) {
  const track = TRACKS[raceId] ?? FALLBACK;
  const [, , w, h] = track.viewBox.split(" ").map(Number);
  const transform = trackTransform(raceId, w || 280, h || 160);
  return (
    <svg
      className={className}
      viewBox={track.viewBox}
      aria-hidden="true"
      focusable="false"
    >
      <g transform={transform}>
        <path
          d={track.d}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}
