import { motion } from 'framer-motion';

export default function JarvisLogo({ size = 48, className = '' }) {
  const s = size;
  const cx = s / 2;
  const r1 = s * 0.44; // outer ring
  const r2 = s * 0.32; // mid ring
  const r3 = s * 0.20; // inner ring
  const r4 = s * 0.10; // core

  // Triangle points for inner arc-reactor triangles
  const tri = (radius, angle) => {
    const rad = (angle * Math.PI) / 180;
    return `${cx + radius * Math.cos(rad)},${cx + radius * Math.sin(rad)}`;
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: s, height: s }}>
      {/* Ambient glow */}
      <div
        className="absolute inset-0 rounded-full animate-pulse"
        style={{
          background: 'radial-gradient(circle, rgba(6,182,212,0.35) 0%, transparent 70%)',
          filter: 'blur(8px)',
          transform: 'scale(1.4)',
        }}
      />

      <svg width={s} height={s} viewBox={`0 0 ${s} ${s}`} className="relative z-10">
        <defs>
          <filter id={`glow-${s}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <radialGradient id={`core-${s}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#e0f9ff" />
            <stop offset="40%" stopColor="#22d3ee" />
            <stop offset="100%" stopColor="#0891b2" />
          </radialGradient>
          <radialGradient id={`mid-${s}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#67e8f9" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.2" />
          </radialGradient>
        </defs>

        {/* Outer rotating ring */}
        <motion.g
          style={{ originX: `${cx}px`, originY: `${cx}px` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
        >
          <circle cx={cx} cy={cx} r={r1} fill="none" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.5" />
          {[0, 60, 120, 180, 240, 300].map((a) => {
            const rad = (a * Math.PI) / 180;
            return (
              <circle
                key={a}
                cx={cx + r1 * Math.cos(rad)}
                cy={cx + r1 * Math.sin(rad)}
                r={s * 0.022}
                fill="#22d3ee"
                fillOpacity="0.9"
                filter={`url(#glow-${s})`}
              />
            );
          })}
          {/* Dashed arc segments */}
          {[30, 90, 150, 210, 270, 330].map((a) => {
            const a1 = ((a - 15) * Math.PI) / 180;
            const a2 = ((a + 15) * Math.PI) / 180;
            const x1 = cx + r1 * Math.cos(a1);
            const y1 = cx + r1 * Math.sin(a1);
            const x2 = cx + r1 * Math.cos(a2);
            const y2 = cx + r1 * Math.sin(a2);
            return (
              <path
                key={a}
                d={`M${x1},${y1} A${r1},${r1} 0 0,1 ${x2},${y2}`}
                fill="none"
                stroke="#67e8f9"
                strokeWidth="1.5"
                strokeOpacity="0.7"
                filter={`url(#glow-${s})`}
              />
            );
          })}
        </motion.g>

        {/* Middle counter-rotating ring */}
        <motion.g
          style={{ originX: `${cx}px`, originY: `${cx}px` }}
          animate={{ rotate: -360 }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
        >
          <circle cx={cx} cy={cx} r={r2} fill="none" stroke="#06b6d4" strokeWidth="0.6" strokeOpacity="0.4" />
          {[0, 90, 180, 270].map((a) => {
            const rad = (a * Math.PI) / 180;
            return (
              <rect
                key={a}
                x={cx + r2 * Math.cos(rad) - s * 0.025}
                y={cx + r2 * Math.sin(rad) - s * 0.025}
                width={s * 0.05}
                height={s * 0.05}
                fill="#22d3ee"
                fillOpacity="0.8"
                transform={`rotate(${a + 45} ${cx + r2 * Math.cos(rad)} ${cx + r2 * Math.sin(rad)})`}
                filter={`url(#glow-${s})`}
              />
            );
          })}
          {/* Arc segments */}
          {[45, 135, 225, 315].map((a) => {
            const a1 = ((a - 30) * Math.PI) / 180;
            const a2 = ((a + 30) * Math.PI) / 180;
            const x1 = cx + r2 * Math.cos(a1);
            const y1 = cx + r2 * Math.sin(a1);
            const x2 = cx + r2 * Math.cos(a2);
            const y2 = cx + r2 * Math.sin(a2);
            return (
              <path
                key={a}
                d={`M${x1},${y1} A${r2},${r2} 0 0,1 ${x2},${y2}`}
                fill="none"
                stroke="#22d3ee"
                strokeWidth="2"
                strokeOpacity="0.8"
                filter={`url(#glow-${s})`}
              />
            );
          })}
        </motion.g>

        {/* Inner ring with triangles */}
        <motion.g
          style={{ originX: `${cx}px`, originY: `${cx}px` }}
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        >
          <circle cx={cx} cy={cx} r={r3} fill={`url(#mid-${s})`} stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.6" />
          {[0, 120, 240].map((a) => (
            <polygon
              key={a}
              points={`${tri(r3 * 0.85, a)} ${tri(r3 * 0.45, a + 30)} ${tri(r3 * 0.45, a - 30)}`}
              fill="#22d3ee"
              fillOpacity="0.7"
              filter={`url(#glow-${s})`}
            />
          ))}
        </motion.g>

        {/* Pulsing core */}
        <motion.circle
          cx={cx}
          cy={cx}
          fill={`url(#core-${s})`}
          filter={`url(#glow-${s})`}
          initial={{ r: r4, opacity: 0.8 }}
          animate={{ r: [r4 * 0.9, r4 * 1.15, r4 * 0.9], opacity: [0.8, 1, 0.8] }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <circle cx={cx} cy={cx} r={r4 * 0.5} fill="white" fillOpacity="0.9" filter={`url(#glow-${s})`} />
      </svg>
    </div>
  );
}