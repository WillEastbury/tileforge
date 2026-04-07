#!/usr/bin/env python3
"""Generate wonder construction videos using OpenAI Sora SDK."""
import os, sys, time
from concurrent.futures import ThreadPoolExecutor, as_completed
import openai

client = openai.OpenAI()
OUT = "/root/tileforge/assets/video/wonders"
os.makedirs(OUT, exist_ok=True)

WONDERS = [
    # medieval
    ("chichen_itza", "Chichen Itza", "medieval"),
    ("machu_picchu", "Machu Picchu", "medieval"),
    # renaissance
    ("printing_press", "Printing Press", "renaissance"),
    ("sistine_chapel", "Sistine Chapel", "renaissance"),
    ("taj_mahal", "Taj Mahal", "renaissance"),
    ("forbidden_city", "Forbidden City", "renaissance"),
    ("versailles", "Versailles", "renaissance"),
    ("globe_theatre", "Globe Theatre", "renaissance"),
    ("east_india_co", "East India Trading Company", "renaissance"),
    # industrial
    ("big_ben", "Big Ben", "industrial"),
    ("domesday_book", "Domesday Book", "industrial"),
    ("oxford_uni", "Oxford University", "industrial"),
    ("eiffel_tower", "Eiffel Tower", "industrial"),
    ("statue_liberty", "Statue of Liberty", "industrial"),
    ("suez_canal", "Suez Canal", "industrial"),
    ("panama_canal", "Panama Canal", "industrial"),
    ("christ_redeemer", "Christ the Redeemer", "industrial"),
    ("golden_gate", "Golden Gate Bridge", "industrial"),
    # modern
    ("manhattan", "Manhattan Project", "modern"),
    ("united_nations", "United Nations", "modern"),
    ("apollo", "Apollo Program", "modern"),
    ("sydney_opera", "Sydney Opera House", "modern"),
    ("hoover_dam", "Hoover Dam", "modern"),
    ("iss", "International Space Station", "modern"),
    ("lhc", "Large Hadron Collider", "modern"),
    ("world_trade", "World Trade Center", "modern"),
    ("wembley", "Wembley Stadium", "modern"),
    ("abbey_road", "Abbey Road Studios", "modern"),
    ("channel_tunnel", "Channel Tunnel", "modern"),
    ("route_66", "Route 66", "modern"),
    ("bbc", "BBC World Service", "modern"),
    ("lords_cg", "Lord's Cricket Ground", "modern"),
    # ai
    ("internet", "The Internet", "ai"),
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
    # mars
    ("asteroid_belt_claim", "Asteroid Belt Claim", "mars"),
    ("space_elevator", "Space Elevator", "mars"),
    ("mars_colony_alpha", "Mars Colony Alpha", "mars"),
    ("terraforming", "Terraforming Engine", "mars"),
    ("ark", "Ark of Civilization", "mars"),
]

def make_prompt(name, era):
    if era == "mars":
        return f"Cinematic visualization of {name} being constructed on Mars or in deep space. Red planet landscape, orbital structures, fusion-powered machinery, astronauts in advanced suits. Epic sci-fi scale. Camera pulls back to reveal the completed megastructure. 4K cinematic footage."
    elif era == "ai":
        return f"Cinematic visualization of {name} coming online in the AI era. Futuristic technology, holographic displays, glowing circuitry, sleek architecture. Camera reveals the scale of the achievement. 4K cinematic sci-fi footage."
    else:
        return f"Cinematic timelapse of the construction of {name}, a wonder of the {era} era. Workers building the structure from foundation to completion. Golden hour lighting, epic scale, historical accuracy. Camera slowly pulls back to reveal the finished monument. 4K quality cinematic footage."

def generate(wonder_id, name, era):
    path = f"{OUT}/{wonder_id}.mp4"
    if os.path.exists(path) and os.path.getsize(path) > 10000:
        print(f"  SKIP {wonder_id} (exists)")
        return "skip"
    prompt = make_prompt(name, era)
    try:
        resp = client.videos.create(model="sora-2", prompt=prompt, size="1280x720", seconds=12)
        vid_id = resp.id
        print(f"  Started {wonder_id}: {vid_id}")
        # Poll
        for _ in range(120):
            time.sleep(10)
            status = client.videos.retrieve(vid_id)
            if status.status == "completed":
                content = client.videos.download_content(vid_id)
                with open(path, "wb") as f:
                    f.write(content.read())
                sz = os.path.getsize(path) / 1024 / 1024
                print(f"  ✅ {wonder_id}.mp4 ({sz:.1f} MB)")
                return "ok"
            elif status.status == "failed":
                print(f"  ❌ {wonder_id} failed: {status}")
                return "fail"
        print(f"  ⏰ {wonder_id} timed out")
        return "timeout"
    except Exception as e:
        print(f"  ❌ {wonder_id} error: {e}")
        return "fail"

if __name__ == "__main__":
    print(f"=== Generating {len(WONDERS)} wonder videos (3 concurrent) ===")
    ok, fail, skip = [], [], []
    with ThreadPoolExecutor(max_workers=3) as pool:
        futs = {pool.submit(generate, wid, name, era): wid for wid, name, era in WONDERS}
        for f in as_completed(futs):
            wid = futs[f]
            r = f.result()
            if r == "ok": ok.append(wid)
            elif r == "skip": skip.append(wid)
            else: fail.append(wid)
    print(f"\n=== DONE: ✅{len(ok)} ⏭{len(skip)} ❌{len(fail)} ===")
    if fail:
        print("Failed:", fail)
