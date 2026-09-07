import elevation from '@/data/tour-elevation.json';
import { ProfileWeather } from '@/components/profile-weather';

type Summit = {
  name: string;
  altitude: number;
  sampled: number;
  km: number;
  leg: string;
  note: string | null;
};

type Leg = {
  id: string;
  label: string;
  color: string;
  start: string;
  end: string;
  startKm: number;
  endKm: number;
};

const legs = elevation.legs as Leg[];
const summits = elevation.summits as Summit[];
const points = elevation.points as Array<[number, number]>;
const { totalKm, startElevation, endElevation } = elevation;

export const summitCount = summits.length;
export const highestSummit = summits.reduce((best, summit) => (summit.altitude > best.altitude ? summit : best), summits[0]);
export const climbedMetres = summits.reduce((total, summit) => total + summit.altitude, 0);

// Climb categories borrowed from stage racing, so the badge encodes how hard the pass is.
function category(altitude: number) {
  if (altitude >= 2400) return 'HC';
  if (altitude >= 2200) return '1';
  if (altitude >= 2000) return '2';
  return '3';
}

const VIEW_W = 1200;
const PLOT_L = 12;
const PLOT_R = 1188;
const LABEL_H = 236;
const PROFILE_H = 210;
const AXIS_Y = LABEL_H + PROFILE_H;
const AXIS_H = 19;
const BAND_Y = AXIS_Y + AXIS_H;
const BAND_H = 26;
const VIEW_H = BAND_Y + BAND_H;
const MAX_METRES = 2650;
const TOP_LINE = 212;
const BADGE_TOP = TOP_LINE - 26;
const TEXT_BASE = BADGE_TOP - 6;

const x = (km: number) => PLOT_L + (km / totalKm) * (PLOT_R - PLOT_L);
const y = (metres: number) => LABEL_H + PROFILE_H - (metres / MAX_METRES) * PROFILE_H;

const ridge = points.map(([km, metres]) => `${x(km).toFixed(1)},${y(metres).toFixed(1)}`).join(' ');
const area = `M ${x(points[0][0]).toFixed(1)},${(LABEL_H + PROFILE_H).toFixed(1)} L ${ridge.replaceAll(' ', ' L ')} L ${x(points.at(-1)![0]).toFixed(1)},${(LABEL_H + PROFILE_H).toFixed(1)} Z`;

// Notes sit in whichever column beside the leader line is not crowded by a neighbour.
const labelled = summits.map((summit, index) => {
  const previous = summits[index - 1];
  const next = summits[index + 1];
  const gapRight = next ? x(next.km) - x(summit.km) : Infinity;
  const gapLeft = previous ? x(summit.km) - x(previous.km) : x(summit.km);
  const noteSide = !summit.note ? 0 : gapRight > 26 ? 1 : gapLeft > 26 ? -1 : 0;
  return { ...summit, noteSide, color: legs.find((leg) => leg.id === summit.leg)?.color ?? '#173230' };
});

// Drop a kilometre marker when it would collide with the one before it.
const axisMarks = legs.reduce<Array<{ id: string; km: number }>>((marks, leg) => {
  const previous = marks.at(-1);
  if (!previous || x(leg.endKm) - x(previous.km) > 46) marks.push({ id: leg.id, km: leg.endKm });
  else marks[marks.length - 1] = { id: leg.id, km: leg.endKm };
  return marks;
}, []);

export function StageProfile() {
  return (
    <section id="passes" className="profile">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow">The stage profile</p>
            <h2 className="display-title">{summitCount} passes.<br />One line through the roof of Europe.</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Ground elevation sampled every 400 metres along your actual rental route, Zürich to Lugano. Categories follow stage-racing convention: HC above 2,400 m, then 1, 2 and 3. The organiser’s Tuesday warm-up over the Bonette and Izoard runs before you land.</p>
          </div>
          <dl className="profile-tally">
            <div><dt>Passes</dt><dd>{summitCount}</dd></div>
            <div><dt>Summit metres</dt><dd>{climbedMetres.toLocaleString('en-GB')}</dd></div>
            <div><dt>Highest</dt><dd>{highestSummit.altitude.toLocaleString('en-GB')}<span> m</span></dd></div>
          </dl>
        </div>
      </div>

      <ProfileWeather>
          <svg
            className="profile-svg"
            viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
            aria-label={`Elevation profile of the ${totalKm} kilometre drive from Zürich to Lugano, crossing ${summitCount} Alpine passes, the highest being ${highestSummit.name} at ${highestSummit.altitude} metres.`}
          >
            <defs>
              <linearGradient id="profile-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#f0c14e" />
                <stop offset="1" stopColor="#e2a92f" />
              </linearGradient>
            </defs>

            {[1000, 2000].map((metres) => (
              <g key={metres}>
                <line x1={PLOT_L} x2={PLOT_R} y1={y(metres)} y2={y(metres)} className="profile-grid" />
                <text x={PLOT_R} y={y(metres) - 4} className="profile-grid-label" textAnchor="end">{metres.toLocaleString('en-GB')} m</text>
              </g>
            ))}

            <path d={area} fill="url(#profile-fill)" />
            <polyline points={ridge} className="profile-ridge" />

            <g className="profile-terminus">
              <text x={PLOT_L} y={26} className="profile-terminus-name">ZÜRICH</text>
              <text x={PLOT_L} y={42} className="profile-terminus-metres">{startElevation} m · Wed 06:30</text>
              <text x={PLOT_R} y={26} className="profile-terminus-name" textAnchor="end">LUGANO</text>
              <text x={PLOT_R} y={42} className="profile-terminus-metres" textAnchor="end">{endElevation} m · Sun 10:00</text>
            </g>

            {labelled.map((summit, index) => {
              const cx = x(summit.km);
              const peakY = y(summit.sampled);
              return (
                <g key={`${summit.name}-${index}`}>
                  <line x1={cx} x2={cx} y1={peakY - 2} y2={TOP_LINE} className="profile-leader" />
                  <circle cx={cx} cy={peakY - 1} r="2.6" fill={summit.color} stroke="#fffdf8" strokeWidth="1.4" />
                  <rect x={cx - 8} y={BADGE_TOP} width="16" height="13" rx="2.5" fill={summit.color} />
                  <text x={cx} y={BADGE_TOP + 9.6} className="profile-badge-text" textAnchor="middle">{category(summit.altitude)}</text>
                  <text x={cx} y={TEXT_BASE} className="profile-summit" transform={`rotate(-90 ${cx} ${TEXT_BASE})`}>
                    <tspan className="profile-summit-metres">{summit.altitude.toLocaleString('en-GB')} m</tspan>
                    <tspan dx="5">{summit.name}</tspan>
                  </text>
                  {summit.noteSide !== 0 ? (
                    <text
                      x={cx + summit.noteSide * 11}
                      y={TEXT_BASE}
                      className="profile-summit-note"
                      transform={`rotate(-90 ${cx + summit.noteSide * 11} ${TEXT_BASE})`}
                    >
                      {summit.note}
                    </text>
                  ) : null}
                </g>
              );
            })}

            <rect x={PLOT_L} y={AXIS_Y} width={PLOT_R - PLOT_L} height={AXIS_H} className="profile-axis" />
            {labelled.map((summit, index) => (
              <line key={`tick-${index}`} x1={x(summit.km)} x2={x(summit.km)} y1={AXIS_Y} y2={AXIS_Y + 5} className="profile-tick" />
            ))}
            <text x={PLOT_L + 7} y={AXIS_Y + 13} className="profile-axis-text">0 km</text>
            {axisMarks.map((mark) => (
              <text key={`km-${mark.id}`} x={x(mark.km) - 7} y={AXIS_Y + 13} className="profile-axis-text" textAnchor="end">
                {Math.round(mark.km)}
              </text>
            ))}

            {legs.map((leg) => (
              <g key={`band-${leg.id}`}>
                <rect x={x(leg.startKm)} y={BAND_Y} width={x(leg.endKm) - x(leg.startKm)} height={BAND_H} fill={leg.color} opacity=".22" />
                <line x1={x(leg.endKm)} x2={x(leg.endKm)} y1={BAND_Y} y2={BAND_Y + BAND_H} className="profile-band-edge" />
                <text x={(x(leg.startKm) + x(leg.endKm)) / 2} y={BAND_Y + 17} className="profile-band-text" textAnchor="middle" fill={leg.color}>
                  {leg.label.replace(' · Long', '').replace(' · You', '')}
                </text>
              </g>
            ))}
          </svg>
      </ProfileWeather>

      <p className="profile-caption">
        Elevation from Open-Meteo along the generated route · Friday shown with the long San Bernardino option · scroll sideways on a phone
      </p>
    </section>
  );
}
