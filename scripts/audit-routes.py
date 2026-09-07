"""Compare site routes with workbook hyperlinks and validate every GPX download."""
import argparse
import concurrent.futures
import hashlib
import json
import math
from pathlib import Path
import re
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument('--workbook', default='/Users/jayfarei/Downloads/Roadbooks - Updated 2024.xlsx')
parser.add_argument('--live', help='Also verify the deployed files against the validated local bytes')
args = parser.parse_args()
root = Path(__file__).resolve().parents[1]
plans = json.loads((root / 'data/tour-routes.json').read_text())
by_id = {p['id']: p for p in plans}
ns = {'s': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main', 'g': 'http://www.topografix.com/GPX/1/1'}
with zipfile.ZipFile(args.workbook) as workbook:
    rels = {r.attrib['Id']: r.attrib['Target'] for r in ET.fromstring(workbook.read('xl/worksheets/_rels/sheet1.xml.rels'))}
    links = {h.attrib['ref']: rels[h.attrib['{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id']] for h in ET.fromstring(workbook.read('xl/worksheets/sheet1.xml')).findall('.//s:hyperlink', ns)}

def source_points(cell):
    url = links[cell]
    points = [(float(lat), float(lon)) for lon, lat in re.findall(r'!1d(-?[\d.]+)!2d(-?[\d.]+)', url)]
    # The Tuesday link includes an explicit routing-shape point after Exilles.
    if cell == 'B1':
        return points
    named = iter(points)
    result = []
    # Split before decoding: encoded slashes occur inside place names.
    for part in url.split('/dir/')[1].split('/@')[0].split('/'):
        part = urllib.parse.unquote(part)
        match = re.fullmatch(r'(-?[\d.]+),(-?[\d.]+)', part)
        result.append(tuple(map(float, match.groups())) if match else next(named))
    return result

expected = {
    'tuesday-warmup': source_points('B1'),
    'wednesday-group': source_points('B16') + source_points('C16')[1:],
    'thursday-loop': source_points('B32') + source_points('C32')[1:],
    'friday-san-bernardino': source_points('B52') + source_points('C52')[1:],
    'friday-albula': source_points('B52') + source_points('F52')[1:],
    'saturday-ascona': source_points('B72') + source_points('C72')[1:],
}
for route_id in ['wednesday-personal', 'wednesday-geneva']:
    first = by_id[route_id]['stops'][0]
    expected[route_id] = [(first['lat'], first['lon'])] + source_points('C16')
for route_id, coords in expected.items():
    actual = [(s['lat'], s['lon']) for s in by_id[route_id]['stops']]
    assert actual == coords, f'{route_id}: workbook waypoint mismatch\n{actual}\n{coords}'

def distance(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    hav = math.sin((lat2-lat1)/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin((lon2-lon1)/2)**2
    return 6371000 * 2 * math.asin(min(1, math.sqrt(hav)))

files = []
largest_snap = (0, '')
for plan in plans:
    route_path = root / f'public/routes/{plan["id"]}.geojson'
    route = json.loads(route_path.read_text())
    geometry = route['features'][0]['geometry']['coordinates']
    indexes = route['properties']['stopGeometryIndexes']
    assert len(indexes) == len(plan['stops']) and indexes == sorted(indexes)
    for i, stop in enumerate(plan['stops']):
        snap = distance((stop['lat'], stop['lon']), tuple(reversed(geometry[indexes[i]])))
        if snap > largest_snap[0]: largest_snap = (round(snap), stop['name'])
        assert snap < 500, f'Large road snap: {plan["id"]} {stop["name"]}: {snap:.0f}m'
    files.append(route_path)
    for start in [None, *range(len(plan['stops']))]:
        path = root / (f'public/gpx/{plan["id"]}.gpx' if start is None else f'public/gpx/continue/{plan["id"]}-from-{start+1:02d}.gpx')
        doc = ET.fromstring(path.read_bytes())
        stops = doc.findall('g:rte/g:rtept', ns)
        track = doc.findall('g:trk/g:trkseg/g:trkpt', ns)
        from_index = start or 0
        assert [(float(p.attrib['lat']), float(p.attrib['lon'])) for p in stops] == [(s['lat'], s['lon']) for s in plan['stops'][from_index:]], path
        actual_track = [(float(p.attrib['lon']), float(p.attrib['lat'])) for p in track]
        assert actual_track == [tuple(p) for p in geometry[indexes[from_index]:]], f'Incorrect continuation: {path}'
        if from_index < len(plan['stops'])-1: assert len(track) > 1, path
        files.append(path)

full_ids = ['wednesday-personal', 'thursday-loop', 'friday-san-bernardino', 'saturday-ascona', 'sunday-return']
full = ET.fromstring((root / 'public/gpx/full-tour.gpx').read_bytes())
full_stops = [(float(p.attrib['lat']), float(p.attrib['lon'])) for p in full.findall('g:rte/g:rtept', ns)]
assert full_stops == [(s['lat'], s['lon']) for n, route_id in enumerate(full_ids) for s in by_id[route_id]['stops'][1 if n else 0:]]
archive_path = root / 'public/downloads/fondue-tour-2026-tomtom-gpx.zip'
with zipfile.ZipFile(archive_path) as archive:
    assert sorted(archive.namelist()) == sorted(['full-tour.gpx', *[p['id']+'.gpx' for p in plans]])
    for name in archive.namelist(): assert archive.read(name) == (root / 'public/gpx' / name).read_bytes(), name
files += [root / 'public/gpx/full-tour.gpx', root / 'public/routes/full-tour.geojson', archive_path]
if args.live:
    def verify(path):
        url = args.live.rstrip('/') + '/' + str(path.relative_to(root / 'public'))
        with urllib.request.urlopen(url + '?audit=' + hashlib.sha256(path.read_bytes()).hexdigest()[:12], timeout=30) as response:
            body = response.read()
            assert response.status == 200 and body == path.read_bytes(), url
        return url
    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        list(pool.map(verify, files))
print(json.dumps({'workbook_routes_matched': len(expected), 'personal_return_routes': 1, 'route_plans': len(plans), 'stops': sum(len(p['stops']) for p in plans), 'gpx_files': sum(p.suffix == '.gpx' for p in files), 'validated_files': len(files), 'largest_road_snap_metres': largest_snap, 'live_bytes_verified': bool(args.live)}, indent=2))
