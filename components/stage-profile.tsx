import elevation from '@/data/tour-elevation.json';
import { ProfileWeather } from '@/components/profile-weather';

export const summitCount = elevation.summits.length;
export const highestSummit = elevation.summits.reduce((best, summit) => summit.altitude > best.altitude ? summit : best);
export const climbedMetres = elevation.summits.reduce((total, summit) => total + summit.altitude, 0);

export function StageProfile() {
  return (
    <section id="passes" className="profile">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="eyebrow">The stage profile</p>
            <h2 className="display-title">{summitCount} passes.<br />One line through the roof of Europe.</h2>
            <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Elevation and forecasts along the same rental route, Zürich to Lugano. Friday follows the long San Bernardino option. The organiser’s Tuesday warm-up runs before you land.</p>
          </div>
          <dl className="profile-tally">
            <div><dt>Passes</dt><dd>{summitCount}</dd></div>
            <div><dt>Summit metres</dt><dd>{climbedMetres.toLocaleString('en-GB')}</dd></div>
            <div><dt>Highest</dt><dd>{highestSummit.altitude.toLocaleString('en-GB')}<span> m</span></dd></div>
          </dl>
        </div>
      </div>
      <ProfileWeather />
    </section>
  );
}
