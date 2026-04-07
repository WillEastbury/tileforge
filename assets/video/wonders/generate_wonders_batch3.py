import requests, time, os
from concurrent.futures import ThreadPoolExecutor, as_completed

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
OUT = "/root/tileforge/assets/video/wonders"
os.makedirs(OUT, exist_ok=True)

WONDERS = [
    ("great_firewall", "Great Firewall", "ai"),
    ("singularity", "The Singularity", "ai"),
    ("global_network", "Global Network", "ai"),
    ("dyson_sphere", "Dyson Sphere Prototype", "ai"),
    ("quantum_internet", "Quantum Internet", "ai"),
    ("machine_consciousness", "Machine Consciousness", "ai"),
    ("orbital_ring", "Orbital Ring", "ai"),
    ("mobile_revolution", "Mobile Revolution", "ai"),
    ("social_singularity", "The Algorithm", "ai"),
    ("human_genome", "Human Genome Project", "ai"),
    ("asteroid_belt_claim", "Asteroid Belt Claim", "mars"),
    ("space_elevator", "Space Elevator", "mars"),
    ("mars_colony_alpha", "Mars Colony Alpha", "mars"),
    ("terraforming", "Terraforming Engine", "mars"),
    ("ark", "Ark of Civilization", "mars"),
]

def generate_video(wonder_id, wonder_name, era):
    path = f"{OUT}/{wonder_id}.mp4"
    if os.path.exists(path):
        print(f"  SKIP {wonder_id} (exists)", flush=True)
        return ("skip", wonder_id)
    if era == 'mars':
        prompt = f"Cinematic visualization of {wonder_name} being constructed on Mars or in deep space. Red planet landscape, orbital structures, fusion-powered machinery, astronauts in advanced suits. Epic sci-fi scale. Camera pulls back to reveal the completed megastructure. 4K cinematic footage."
    elif era == 'ai':
        prompt = f"Cinematic visualization of {wonder_name} coming online in the AI era. Futuristic technology, holographic displays, glowing circuitry, sleek architecture. Camera reveals the scale of the achievement. 4K cinematic sci-fi footage."
    else:
        prompt = f"Cinematic timelapse of the construction of {wonder_name}. Workers building the structure from foundation to completion. Golden hour lighting, epic scale, historical accuracy. Camera slowly pulls back to reveal the finished monument. 4K quality cinematic footage."
    try:
        resp = requests.post("https://api.openai.com/v1/videos",
            headers=headers,
            json={"model": "sora-2", "prompt": prompt, "size": "1280x720"})
        resp.raise_for_status()
        data = resp.json()
        video_id = data["id"]
        print(f"  Started {wonder_id}: {video_id}", flush=True)
        for i in range(90):
            time.sleep(15)
            status_resp = requests.get(f"https://api.openai.com/v1/videos/{video_id}", headers=headers)
            status = status_resp.json()
            st = status.get("status")
            prog = status.get("progress", "?")
            if st == "completed":
                content = requests.get(f"https://api.openai.com/v1/videos/{video_id}/content", headers=headers)
                content.raise_for_status()
                with open(path, "wb") as f:
                    f.write(content.content)
                sz = os.path.getsize(path) / 1024 / 1024
                print(f"  ✅ {wonder_id}.mp4 ({sz:.1f} MB)", flush=True)
                return ("ok", wonder_id)
            elif st == "failed":
                err = status.get("error", status)
                print(f"  ❌ {wonder_id} failed: {err}", flush=True)
                return ("fail", wonder_id)
            elif i % 4 == 0:
                print(f"  ... {wonder_id}: {st} ({prog}%)", flush=True)
        print(f"  ⏰ {wonder_id} timed out", flush=True)
        return ("timeout", wonder_id)
    except Exception as e:
        print(f"  ❌ {wonder_id} error: {e}", flush=True)
        return ("fail", wonder_id)

print(f"Generating {len(WONDERS)} wonder videos (3 workers)...", flush=True)
t0 = time.time()
results = {"ok": [], "fail": [], "skip": [], "timeout": []}
with ThreadPoolExecutor(max_workers=3) as pool:
    futures = {pool.submit(generate_video, wid, wname, era): wid for wid, wname, era in WONDERS}
    for fut in as_completed(futures):
        status, wid = fut.result()
        results[status].append(wid)

elapsed = time.time() - t0
print(f"\n===== SUMMARY ({elapsed/60:.1f} min) =====")
print(f"✅ Success: {len(results['ok'])} — {', '.join(results['ok']) or 'none'}")
print(f"⏭️  Skipped: {len(results['skip'])} — {', '.join(results['skip']) or 'none'}")
print(f"❌ Failed:  {len(results['fail'])} — {', '.join(results['fail']) or 'none'}")
print(f"⏰ Timeout: {len(results['timeout'])} — {', '.join(results['timeout']) or 'none'}")
