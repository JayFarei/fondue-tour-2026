import type { LucideIcon } from 'lucide-react';
import Image from 'next/image';
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Bath,
  BedDouble,
  CableCar,
  CarFront,
  Check,
  Clock3,
  Coffee,
  Fuel,
  Map,
  MapPinned,
  Mountain,
  Plane,
  Route,
  ShieldCheck,
  Sparkles,
  Utensils,
} from 'lucide-react';
import { assetPath } from '@/lib/asset-path';
import { StageProfile, highestSummit, summitCount } from '@/components/stage-profile';
import { FullTourOverview, TourMap } from '@/components/tour-map';
import routePlans from '@/data/tour-routes.json';
import { directionsUrl, routeParts } from '@/lib/navigation';
import { StopWeather } from '@/components/stop-weather';
import { extraWeatherLocations, type WeatherLocation } from '@/lib/weather';

// The page has no request-time data, so it can be emitted as pure HTML. This lets
// the same source produce a static export for GitHub Pages.
export const dynamic = 'force-static';

const mapsRoute = (origin: string, destination: string, waypoints: string[] = [], travelmode = 'driving') => {
  const params = new URLSearchParams({ api: '1', origin, destination, travelmode });
  if (waypoints.length) params.set('waypoints', waypoints.join('|'));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
};

const mapLinks = {
  personalMeet: directionsUrl(routePlans[1].stops.slice(0, 2)),
  genevaMeet: directionsUrl(routePlans[2].stops.slice(0, 2)),
  luganoBellinzona: mapsRoute("AMAG Automobili e Motori SA, Via Monte Boglia 24, Lugano, Switzerland", "Bellinzona railway station, Switzerland", [], "transit"),
  bellinzonaMalpensa: mapsRoute("Bellinzona railway station, Switzerland", "Milan Malpensa Airport Terminal 2, Italy", [], "transit"),
};

type RouteButton = { label: string; href: string; note?: string };
const routeButtons = (id: string, from: number, to: number, label: string): RouteButton[] => {
  const plan = routePlans.find(p => p.id === id)!;
  const parts = routeParts(plan.stops.slice(from, to + 1));
  return parts.map((part, i) => ({ label: `${label}${parts.length > 1 ? ` · ${i + 1}/${parts.length}` : ''}`, href: part.href, note: `${part.stops[0].name} → ${part.stops.at(-1)!.name}` }));
};
type Stop = { time: string; place: string; note: string; icon?: LucideIcon };
type Day = {
  id: string;
  emblem: number;
  number: string;
  weekday: string;
  date: string;
  countries: string;
  title: string;
  subtitle: string;
  accent: string;
  badge?: string;
  routes: RouteButton[];
  stops: Stop[];
  callout?: { title: string; copy: string; icon: LucideIcon };
};

const days: Day[] = [
  {
    id: 'tuesday',
    emblem: 0,
    number: '00',
    weekday: 'Tue',
    date: '08 Sep',
    countries: 'France · Italy · France',
    title: 'Menton → Val Cenis',
    subtitle: 'The organiser’s warm-up day. You will be flying to Zürich while this route runs.',
    accent: '#d39b31',
    badge: 'Warm-up crew',
    routes: [
      ...routeButtons('tuesday-warmup', 0, 3, 'Bonette to Izoard'),
      ...routeButtons('tuesday-warmup', 3, 8, 'Izoard to hotel'),
    ],
    stops: [
      { time: '09:30', place: 'Menton', note: 'Roadbook departure' },
      { time: '11:55', place: 'Col de la Bonette', note: 'Picnic stop', icon: Utensils },
      { time: '15:23', place: 'Col d’Izoard', note: 'Pass / coffee option', icon: Coffee },
      { time: '18:47', place: 'Val Cenis', note: 'Saint Charles Hôtel & Spa', icon: BedDouble },
    ],
    callout: { title: 'Your parallel plan', copy: 'Gatwick 17:05 → Zürich 19:50. Collect the car at 21:30, then sleep at ibis Budget Zürich Airport.', icon: Plane },
  },
  {
    id: 'wednesday',
    emblem: 1,
    number: '01',
    weekday: 'Wed',
    date: '09 Sep',
    countries: 'France → Italy',
    title: 'Col des Aravis → La Thuile',
    subtitle: 'Rendezvous, Roselend, Petit-Saint-Bernard and the first group border crossing.',
    accent: '#b84a32',
    badge: 'Meet 13:00–14:00',
    routes: [
      { label: 'Your Zürich → meetup route', href: mapLinks.personalMeet, note: 'Leave 06:30–06:45' },
      { label: 'Geneva → meetup route', href: mapLinks.genevaMeet, note: 'Marco & Si · lands 11:05' },
      ...routeButtons('wednesday-group', 0, 6, 'Group morning'),
      ...routeButtons('wednesday-group', 6, 12, 'Group afternoon'),
    ],
    stops: [
      { time: '13:14', place: 'Col des Aravis', note: 'Lunch & rendezvous', icon: Utensils },
      { time: '15:57', place: 'Les Saisies', note: 'Scenic leg' },
      { time: '16:42', place: 'Roselend', note: 'Coffee / photo stop', icon: Coffee },
      { time: '18:50', place: 'Chalet Eden', note: 'La Thuile · dinner 20:30', icon: BedDouble },
    ],
    callout: { title: 'Meetup pin', copy: 'Restaurant Le Chalet Savoyard, 7400 Route du Col des Aravis, La Clusaz. Aim to arrive before 13:00.', icon: MapPinned },
  },
  {
    id: 'thursday',
    emblem: 2,
    number: '02',
    weekday: 'Thu',
    date: '10 Sep',
    countries: 'Italy → Switzerland',
    title: 'Great St Bernard → Furka loop',
    subtitle: 'Aosta, Great St Bernard, flexible lakeside lunch, Furka, Tremola and Nufenen.',
    accent: '#396b67',
    routes: [
      ...routeButtons('thursday-loop', 0, 4, 'Morning to Sierre'),
      ...routeButtons('thursday-loop', 4, 7, 'Lunch to Landhaus'),
      ...routeButtons('thursday-loop', 7, 13, 'Furka · Tremola · Nufenen'),
    ],
    stops: [
      { time: '09:00', place: 'La Thuile', note: 'Depart hotel' },
      { time: '10:48', place: 'Great St Bernard', note: 'Photo stop', icon: Mountain },
      { time: '12:33', place: 'Lac de Géronde', note: 'Flexible lunch / swim', icon: Bath },
      { time: '15:14', place: 'Landhaus', note: 'Optional check-in' },
      { time: '15:40', place: 'Belvedere Furka', note: 'Glacier viewpoint' },
      { time: '18:26', place: 'Landhaus', note: 'Dinner 20:15', icon: BedDouble },
    ],
    callout: { title: 'Lunch stays flexible', copy: 'Choose Lac de Géronde or Restaurant Z’Matt. The hotel kitchen closes at 20:30, so preserve the 20:15 dinner.', icon: Utensils },
  },
  {
    id: 'friday',
    emblem: 3,
    number: '03',
    weekday: 'Fri',
    date: '11 Sep',
    countries: 'Switzerland',
    title: 'Gelmerbahn → Valbella',
    subtitle: 'Grimsel, Gelmerbahn, Susten and Oberalp — then a weather-led choice for the afternoon.',
    accent: '#5b637d',
    badge: 'Printed voucher',
    routes: [
      ...routeButtons('friday-san-bernardino', 0, 6, 'Morning · Gelmerbahn & Susten'),
      ...routeButtons('friday-san-bernardino', 6, 14, 'Option 1 · San Bernardino'),
      ...routeButtons('friday-albula', 6, 12, 'Option 2 · Albula Pass'),
    ],
    stops: [
      { time: '08:20', place: 'Landhaus', note: 'Early departure' },
      { time: '09:00', place: 'Gelmerbahn', note: 'Walk from parking', icon: CableCar },
      { time: '09:48', place: 'Ascent', note: 'Descent at 10:24', icon: Clock3 },
      { time: '12:21', place: 'Susten Pass', note: 'Drive to Oberalp' },
      { time: '13:21', place: 'Ustria Alpsu', note: 'Lunch & route decision', icon: Utensils },
      { time: '18:50', place: 'Valbella', note: 'Waldhaus · dinner 20:00', icon: BedDouble },
    ],
    callout: { title: 'Decision at Oberalp', copy: 'Choose the San Bernardino or Albula route using live pass status, weather and the clock — Google may otherwise reroute through tunnels.', icon: Route },
  },
  {
    id: 'saturday',
    emblem: 4,
    number: '04',
    weekday: 'Sat',
    date: '12 Sep',
    countries: 'Switzerland → Italy → Switzerland',
    title: 'Mountain karts → Ascona',
    subtitle: 'Savognin, Engadin lakes, Maloja, Splügen and San Bernardino before the Ticino finish.',
    accent: '#836036',
    routes: [
      ...routeButtons('saturday-ascona', 0, 3, 'Morning to Maloja'),
      ...routeButtons('saturday-ascona', 3, 8, 'Afternoon to Ascona'),
    ],
    stops: [
      { time: '09:00', place: 'Valbella', note: 'Depart hotel' },
      { time: '09:28', place: 'Mountain karts', note: 'Wasescha Sport · to 11:58', icon: Sparkles },
      { time: '12:50', place: 'Maloja', note: 'Flexible lunch', icon: Utensils },
      { time: '15:00', place: 'Stampa', note: 'Fuel stop', icon: Fuel },
      { time: '16:18', place: 'Splügen Pass', note: '30-minute break' },
      { time: '18:44', place: 'Hotel Ascona', note: 'Heated pool', icon: BedDouble },
    ],
    callout: { title: 'Correct hotel address', copy: 'Use Hotel Ascona, Via Signor in Croce 1, 6612 Ascona. The address typed in the spreadsheet’s hotel row was copied from Valbella.', icon: AlertTriangle },
  },
  {
    id: 'sunday',
    emblem: 5,
    number: '05',
    weekday: 'Sun',
    date: '13 Sep',
    countries: 'Switzerland',
    title: 'Ascona → Lugano → Bellinzona',
    subtitle: 'Your tour closes with the domestic one-way return and the trip home to family.',
    accent: '#263d45',
    badge: 'Car due 10:00',
    routes: [
      ...routeButtons('sunday-return', 0, 1, 'Drive to AMAG Lugano'),
      { label: 'Public transport to Bellinzona', href: mapLinks.luganoBellinzona },
    ],
    stops: [
      { time: '08:15', place: 'Hotel Ascona', note: 'Suggested departure' },
      { time: 'Before 10', place: 'Refuel', note: 'Return at same level', icon: Fuel },
      { time: '10:00', place: 'AMAG Lugano', note: 'Via Monte Boglia 24', icon: CarFront },
      { time: 'After return', place: 'Bellinzona', note: 'Bus / train home', icon: Map },
    ],
    callout: { title: 'Document the return', copy: 'Photograph every panel, fuel gauge, mileage, parking bay and key-drop. Keep the final receipt and return evidence.', icon: ShieldCheck },
  },
];

const weatherStopsFor = (id: string, indexes: number[]) => indexes.map(i => routePlans.find(p => p.id === id)!.stops[i]);
const dayWeatherStops: Record<string, WeatherLocation[]> = {
  tuesday: weatherStopsFor('tuesday-warmup', [0, 1, 3, 8]),
  wednesday: weatherStopsFor('wednesday-personal', [1, 2, 3, 7]),
  thursday: weatherStopsFor('thursday-loop', [0, 3, 4, 7, 8, 13]),
  friday: weatherStopsFor('friday-san-bernardino', [0, 2, 2, 5, 6, 14]),
  saturday: weatherStopsFor('saturday-ascona', [0, 1, 3, 4, 5, 8]),
  sunday: [...weatherStopsFor('sunday-return', [0, 1, 1]), extraWeatherLocations.bellinzona],
};

// Wednesday's three driving approaches, all aiming at the same 13:00 lunch.
// Distances and times are the mapped leg to Col des Aravis.
const approaches = [
  {
    id: 'geneva',
    origin: 'Geneva',
    clock: '11:05',
    clockNote: 'Wheels down',
    who: 'Marco · Si',
    copy: 'Lands from London 08:25. Collect the car, then 65 km up through Annecy and La Clusaz.',
    distance: '65 km',
    mapped: '1h 11m',
    href: mapLinks.genevaMeet,
    accent: '#cf6a44',
  },
  {
    id: 'zurich',
    origin: 'Zürich',
    clock: '06:30',
    clockNote: 'Roll out',
    who: 'Gabriele',
    copy: 'Landed Tuesday night and slept at the airport ibis. The long run across France.',
    distance: '334 km',
    mapped: '4h 07m',
    href: mapLinks.personalMeet,
    accent: '#b84a32',
  },
  {
    id: 'valcenis',
    origin: 'Val Cenis',
    clock: '09:00',
    clockNote: 'Group away',
    who: 'Adrien + warm-up crew',
    copy: 'Off the Tuesday warm-up, over Col de l’Iseran and down through Bourg-Saint-Maurice.',
    distance: '147 km',
    mapped: '2h 00m',
    href: routeButtons('wednesday-group', 0, 6, 'Group morning')[0].href,
    accent: '#a93e2b',
  },
];

const tourers = [
  { name: 'Marco', portrait: '/brand/profiles/marco.webp', power: 'Cheese Saber', accent: '#f3bf2b' },
  { name: 'Aris', portrait: '/brand/profiles/aris.webp', power: 'Fondue Forks', accent: '#4f81d9' },
  { name: 'Si', portrait: '/brand/profiles/simon.webp', power: 'Molten Shield', accent: '#dc6837' },
  { name: 'Adrien', portrait: '/brand/profiles/adrien.webp', power: 'Raclette Edge', accent: '#83a77f' },
  { name: 'Gabriele', portrait: '/brand/profiles/gabriele.webp', power: 'Alpine Reactor', accent: '#3ca6a0' },
  { name: 'Henry', portrait: '/brand/profiles/henry.webp', power: 'Steam Lance', accent: '#c3ced6' },
];

// Distances and mapped driving times come from the generated OSRM route files in public/routes.
const dayStats: Record<string, { km: number; hours: string; label?: string }> = {
  tuesday: { km: 343, hours: '6h 36m' },
  wednesday: { km: 460, hours: '6h 42m', label: 'from Zürich' },
  thursday: { km: 341, hours: '5h 54m' },
  friday: { km: 333, hours: '5h 30m', label: 'long option' },
  saturday: { km: 241, hours: '4h 12m' },
  sunday: { km: 43, hours: '0h 42m' },
};

function SpriteIcon({ kind, index, label }: { kind: 'leg' | 'practical'; index: number; label: string }) {
  const columns = kind === 'leg' ? 3 : 4;
  const column = index % columns;
  const row = Math.floor(index / columns);
  const x = columns === 3 ? column * 50 : column * (100 / 3);

  return (
    <>
      <span
        className={`sprite-icon sprite-icon-${kind}`}
        style={{ backgroundPosition: `${x}% ${row * 100}%`, backgroundImage: `url("${assetPath(`/brand/${kind === 'leg' ? 'leg-badges' : 'practical-icons'}.webp`)}")` }}
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </>
  );
}

function RouteButtonLink({ route }: { route: RouteButton }) {
  return (
    <a href={route.href} target="_blank" rel="noreferrer" className="route-button">
      <span>
        <span className="block">{route.label}</span>
        {route.note ? <span className="mt-0.5 block text-[10px] font-normal opacity-65">{route.note}</span> : null}
      </span>
      <ArrowUpRight className="size-4" />
    </a>
  );
}

function DayCard({ day }: { day: Day }) {
  const stats = dayStats[day.id];
  return (
    <article id={day.id} className="day-card" style={{ '--day-color': day.accent } as React.CSSProperties}>
      <div className="grid lg:grid-cols-[250px_1fr]">
        <div className="day-plate">
          <div className="day-plate-top">
            <span className="day-plate-number">{day.number}</span>
            <SpriteIcon kind="leg" index={day.emblem} label={`${day.title} emblem`} />
          </div>
          <p className="day-plate-date">{day.weekday}<br />{day.date}</p>
          <p className="day-plate-countries">{day.countries}</p>
          {stats ? (
            <dl className="day-plate-stats">
              <div><dt>Distance</dt><dd>{stats.km}<span> km</span></dd></div>
              <div><dt>Mapped</dt><dd>{stats.hours}</dd></div>
              {stats.label ? <p className="day-plate-stat-note">{stats.label}</p> : null}
            </dl>
          ) : null}
        </div>

        <div className="min-w-0 p-6 sm:p-8">
          <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
            <div className="min-w-0">
              {day.badge ? <span className="day-badge">{day.badge}</span> : null}
              <h3 className="day-title">{day.title}</h3>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{day.subtitle}</p>
            </div>
            <div className="grid shrink-0 gap-2 sm:grid-cols-2 xl:w-[390px] xl:grid-cols-1">
              {day.routes.map((route) => <RouteButtonLink key={route.label} route={route} />)}
            </div>
          </div>

          <ol className="route-line mt-9 grid gap-0 sm:grid-cols-3 xl:grid-cols-6">
            {day.stops.map(({ time, place, note, icon: Icon }, index) => (
              <li key={`${time}-${place}`} className="relative min-w-0 border-l border-border pb-6 pl-6 last:pb-0 sm:border-l-0 sm:border-t sm:pb-0 sm:pl-0 sm:pt-6">
                <span className="route-dot" />
                <div className="flex items-center gap-1.5 text-[var(--day-color)]">
                  {Icon ? <Icon className="size-3.5" /> : null}
                  <p className="stop-time">{time}</p>
                </div>
                <p className="mt-1 truncate font-semibold sm:whitespace-normal">{place}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{note}</p>
                <StopWeather location={dayWeatherStops[day.id]?.[index]} date={`2026-09-${day.date.slice(0, 2)}`} time={time} area={day.id === 'sunday' && index === 1 ? 'Lugano area' : day.id === 'friday' && index === 2 ? 'Valley station' : undefined} />
              </li>
            ))}
          </ol>

          {day.callout ? (
            <div className="day-callout">
              <day.callout.icon className="mt-0.5 size-4 shrink-0 text-[var(--day-color)]" />
              <div>
                <p className="text-sm font-semibold">{day.callout.title}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{day.callout.copy}</p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="site-header">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-2 sm:px-8">
          <a href="#top" className="site-brand flex min-h-11 items-center gap-2.5">
            <Image src={assetPath('/brand/fondue-tour-crest.png')} alt="" width={205} height={298} className="tour-mark" />
            <span className="brand-word"><span className="brand-long">Fondue Tour ’26</span><span className="brand-short">Fondue ’26</span></span>
          </a>
          <nav aria-label="Tour navigation" className="flex items-center gap-1 text-sm text-white/70">
            <a className="header-link" href="#overview"><span className="nav-long">Full route</span><span className="nav-short">Route</span></a>
            <a className="header-link" href="#roadbook"><span className="nav-long">Roadbook</span><span className="nav-short">Days</span></a>
            <a className="header-link header-link-wide" href="#passes">Passes</a>
            <a className="header-link header-link-wide" href="#essentials">Essentials</a>
          </nav>
        </div>
      </header>

      <section id="top" className="tour-hero">
        <Image
          src={assetPath('/brand/hero-road.jpg')}
          alt="Silver convertible on a winding Alpine road at sunrise"
          width={1731}
          height={589}
          priority
          className="hero-image"
        />
        <div className="hero-inner mx-auto max-w-6xl px-5 sm:px-8">
          <div className="hero-topline">
            <Image src={assetPath('/brand/fondue-tour-crest.png')} alt="Fondue Tour crest" width={205} height={298} className="hero-mark" />
            <div className="hero-topline-copy">
              <span className="hero-kicker">Switzerland · France · Italy</span>
              <span className="hero-dates">Drive 9–13 September 2026 · Home 17 September</span>
            </div>
          </div>
          <h1 className="hero-title">
            <span className="hero-title-line">Five days.</span>
            <span className="hero-title-line hero-title-accent">One Alpine line.</span>
          </h1>
          <p className="hero-lede">Your pocket roadbook for every pass, rendezvous, fuel stop and hotel, with restart navigation, open maps and TomTom tracks.</p>

          <ul className="hero-board" aria-label="Tour at a glance">
            <li><span className="hero-board-value">1,418<small>km</small></span><span className="hero-board-label">Zürich to Lugano</span></li>
            <li><span className="hero-board-value">{summitCount}</span><span className="hero-board-label">Passes on your drive</span></li>
            <li><span className="hero-board-value">{highestSummit.altitude.toLocaleString('en-GB')}<small>m</small></span><span className="hero-board-label">{highestSummit.name}, the high point</span></li>
            <li><span className="hero-board-value">13:00</span><span className="hero-board-label">Wed rendezvous, Col des Aravis</span></li>
          </ul>
        </div>
      </section>

      <section id="rendezvous" className="rendezvous" aria-label="Wednesday approaches to the rendezvous">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
          <div className="mb-9 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="eyebrow">Wednesday 9 September</p>
              <h2 className="display-title">Three roads.<br />One lunch table.</h2>
            </div>
            <p className="max-w-sm text-sm leading-6 text-muted-foreground">Everyone converges on Col des Aravis for 13:00. Aris and Henry travel separately from London and Edinburgh.</p>
          </div>

          <ol className="approach-grid">
            {approaches.map((approach) => (
              <li key={approach.id} className="approach" style={{ '--approach-color': approach.accent } as React.CSSProperties}>
                <div className="approach-head">
                  <span className="approach-clock">{approach.clock}</span>
                  <span className="approach-clock-note">{approach.clockNote}</span>
                </div>
                <p className="approach-origin">{approach.origin}</p>
                <p className="approach-who">{approach.who}</p>
                <p className="approach-copy">{approach.copy}</p>
                <dl className="approach-stats">
                  <div><dt>Distance</dt><dd>{approach.distance}</dd></div>
                  <div><dt>Mapped</dt><dd>{approach.mapped}</dd></div>
                </dl>
                {(approach.id === 'valcenis' ? routeButtons('wednesday-group', 0, 6, 'Open the drive') : [{ href: approach.href, label: 'Open the drive' }]).map(link => <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="approach-link">{link.label} <ArrowUpRight className="size-3.5" /></a>)}
              </li>
            ))}
          </ol>

          <div className="rendezvous-target">
            <span className="rendezvous-pin"><MapPinned className="size-4" /></span>
            <div className="min-w-0">
              <p className="rendezvous-target-title">Col des Aravis · 13:00</p>
              <p className="rendezvous-target-note">Restaurant Le Chalet Savoyard, 7400 Route du Col des Aravis, La Clusaz. The afternoon runs together from here to La Thuile.</p>
            </div>
            <p className="rendezvous-margin">Geneva lands 1h 55m before lunch and the drive is 1h 11m, so bags and the rental desk have about 40 minutes.</p>
          </div>
        </div>
      </section>

      <StageProfile />

      <section id="crew" className="crew-section">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8 sm:py-16">
          <div className="mb-7 flex items-end justify-between gap-5">
            <div><p className="eyebrow eyebrow-light">Fondue Force</p><h2 className="display-title">Select your tourer</h2></div>
            <p className="hidden max-w-sm text-right text-sm leading-6 text-white/55 md:block">Six drivers. Six cheese-powered abilities. One gloriously impractical route through the Alps.</p>
          </div>
          <div className="crew-scroller">
            {tourers.map((tourer, index) => (
              <article key={tourer.name} className="tourer-card" style={{ '--tourer-color': tourer.accent } as React.CSSProperties}>
                <div className="tourer-portrait-wrap">
                  <Image src={assetPath(tourer.portrait)} alt={`${tourer.name}, Fondue Tour 2026`} width={480} height={480} className="tourer-portrait" />
                  <span className="tourer-number">{String(index + 1).padStart(2, '0')}</span>
                </div>
                <p className="tourer-name">{tourer.name}</p>
                <p className="tourer-power">{tourer.power}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <FullTourOverview />

      <nav className="day-strip" aria-label="Jump to tour day">
        <div className="mx-auto flex w-max max-w-6xl gap-2">
          {days.map((day) => <a key={day.id} href={`#${day.id}`} className="day-chip" style={{ '--day-color': day.accent } as React.CSSProperties}><span className="day-chip-dot" /><span className="font-semibold">{day.weekday}</span><span className="text-muted-foreground">{day.date.split(' ')[0]}</span></a>)}
        </div>
      </nav>

      <TourMap />

      <section id="roadbook" className="mx-auto max-w-6xl px-5 py-14 sm:px-8 sm:py-20">
        <div className="mb-8 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><p className="eyebrow">Roadbook</p><h2 className="display-title">The tour, day by day</h2></div>
          <p className="max-w-sm text-sm leading-6 text-muted-foreground">Times are the organiser’s plan. Google may recalculate around closures; live pass status remains the final call.</p>
        </div>
        <div className="space-y-6">{days.map((day) => <DayCard key={day.id} day={day} />)}</div>
      </section>

      <section id="essentials" className="essentials">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
          <div className="grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
            <div>
              <p className="eyebrow eyebrow-light">Before every departure</p>
              <h2 className="display-title display-title-lg">The pocket check</h2>
              <p className="mt-5 max-w-md text-sm leading-6 text-white/62">The mountain makes the final decision. Check conditions before the keys turn, then keep the day flexible.</p>
              <a href="https://alpen-paesse.ch/en/" target="_blank" rel="noreferrer" className="map-button map-button-gold mt-7">Check Alpine passes <ArrowUpRight className="size-4" /></a>
            </div>

            <div className="essentials-grid">
              {[
                ['Pass status & weather', 'Recheck every morning and again before the modular Friday route.', 3],
                ['Swiss vignette', 'Your Swiss rental should have it. Verify at pickup; do not buy a duplicate.', 6],
                ['Printed voucher', 'Gelmerbahn: arrive 15 minutes early and allow the walk from parking.', 7],
                ['Swimwear', 'Pools, saunas or wellness areas feature at most overnight stops.', 5],
                ['Fuel rhythm', 'Use the planned Aosta, Bourg-Saint-Maurice, Ulrichen and Stampa stops.', 0],
                ['Documents offline', 'Licence, passport, rental agreement, insurance and return evidence.', 6],
              ].map(([title, copy, iconIndex]) => (
                <div key={String(title)} className="essentials-cell">
                  <div className="mb-5"><SpriteIcon kind="practical" index={iconIndex as number} label={`${title as string} icon`} /></div>
                  <p className="font-semibold">{title as string}</p>
                  <p className="mt-2 text-xs leading-5 text-white/55">{copy as string}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="homeward" className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="homeward-card">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="eyebrow">The way home</p>
              <h2 className="display-title">Bellinzona → Malpensa → Gatwick</h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">Thursday 17 September. Travel from Bellinzona to Malpensa Terminal 2, arrive around 14:15, then fly EZY8306 at 16:50. Scheduled Gatwick arrival: 17:50 UK time.</p>
            </div>
            <a href={mapLinks.bellinzonaMalpensa} target="_blank" rel="noreferrer" className="map-button map-button-dark">Open transit route <ArrowUpRight className="size-4" /></a>
          </div>

          <div className="mt-8 grid gap-3 sm:grid-cols-[1fr_auto_1fr_auto_1fr] sm:items-center">
            {[
              ['Bellinzona', 'Train / S50 connection'],
              ['MXP Terminal 2', 'Aim to arrive 14:15'],
              ['London Gatwick', 'Arrive 17:50 UK'],
            ].map(([place, note], index) => (
              <div key={place} className="contents">
                <div className="homeward-step"><p className="font-semibold">{place}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p><StopWeather location={[extraWeatherLocations.bellinzona, extraWeatherLocations.malpensa, extraWeatherLocations.gatwick][index]} date="2026-09-17" time={[undefined, '14:15', '17:50'][index]} /></div>
                {index < 2 ? <ArrowRight className="mx-auto hidden size-4 text-muted-foreground sm:block" /> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>Fondue Tour 2026 · Personal roadbook</p>
          <p className="flex items-center gap-1.5"><Check className="size-3.5 text-[#396b67]" /> Routes assembled from the organiser’s 31 Aug roadbook</p>
        </div>
      </footer>
    </main>
  );
}
