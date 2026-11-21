import json, subprocess, tempfile, os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
root=Path(__file__).resolve().parents[1]
items=json.load(open(root/'data/needs-audio.json'))
def one(item):
    dest=root/'audio'/f"{item['slug']}.mp3"
    if dest.exists() and dest.stat().st_size>1000: return (item['slug'],'exists')
    text=item['word']
    with tempfile.TemporaryDirectory() as td:
        aiff=Path(td)/'a.aiff'
        subprocess.run(['say','-v','Daniel','-r','165','-o',str(aiff),text],check=True,timeout=30)
        subprocess.run(['ffmpeg','-y','-loglevel','error','-i',str(aiff),'-ar','44100','-ac','1','-b:a','96k',str(dest)],check=True,timeout=30)
    return (item['slug'],'ok')
with ThreadPoolExecutor(max_workers=4) as ex:
    for r in ex.map(one,items):
        print(*r)
