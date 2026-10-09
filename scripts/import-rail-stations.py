"""Rebuild the attributed, compact rail catalog from the pinned upstream CSV archive.
Usage: python3 scripts/import-rail-stations.py /path/to/csv.zip
Download is a separate, explicit step; this script never calls a paid API.
"""
import csv, hashlib, io, json, sys, zipfile
from pathlib import Path

SOURCE_COMMIT = '767e56d662debb0ab38340916c600f5a6cf75e2d'
archive = Path(sys.argv[1]).read_bytes()
assert hashlib.sha256(archive).hexdigest() == '3bfbe72dec99a1ac1e1fcde98f211c337c9cab11e6cbf50a72b8128ad8b48800', 'Archive differs from the reviewed, pinned source'
z = zipfile.ZipFile(io.BytesIO(archive))
def rows(name):
    return list(csv.DictReader(io.StringIO(z.read('csv/' + name + '.csv').decode('utf-8-sig'))))
lines = {x['code']: x['name'] for x in rows('line') if x['closed'] == '0'}
connections = {}
for x in rows('register'):
    if x['line_code'] in lines:
        connections.setdefault(x['station_code'], set()).add(x['line_code'])
stations = []
for x in rows('station'):
    if x['closed'] != '0' or x['code'] not in connections:
        continue
    lat, lng, pref = float(x['lat']), float(x['lng']), int(x['prefecture'])
    assert 20 < lat < 46 and 122 < lng < 154 and 1 <= pref <= 47
    assert x['name_kana'] and x['name_kana'] != 'NULL'
    stations.append([x['code'], x['original_name'], x['name_kana'], pref, lat, lng, sorted(connections[x['code']])])
stations.sort(key=lambda s: s[0])
assert 8500 < len(stations) < 10000 and len({s[0] for s in stations}) == len(stations)
output = {'version': '20260930', 'sourceCommit': SOURCE_COMMIT, 'sourceSha256': hashlib.sha256(archive).hexdigest(), 'license': 'CC-BY-SA-4.0', 'attribution': 'Seo-4d696b75 / station_database; filtered and compacted by Drive+', 'lines': lines, 'stations': stations}
Path('src/data/rail-stations.json').write_text(json.dumps(output, ensure_ascii=False, separators=(',', ':'))+'\n')
print(f'Imported {len(stations)} active station entries; no closed stations, photos or timetables.')
