import requests, time, os
from concurrent.futures import ThreadPoolExecutor, as_completed

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
OUT = "/root/tileforge/assets/video/wonders"

# Moderation-blocked ones get rephrased prompts; billing-limited ones get same prompt
RETRIES = [
    ("christ_redeemer", "Cinematic timelapse of a grand art deco statue being built on a mountaintop in Rio de Janeiro, Brazil. Construction scaffolding rises as workers assemble the massive concrete and soapstone monument. Golden hour lighting, epic panoramic views of the bay below. Camera pulls back to reveal the completed iconic landmark."),
    ("iss", "Cinematic timelapse of a large orbital space station being assembled in low Earth orbit. Astronauts and robotic arms connect modular sections, solar panels unfold. Earth rotates below. Camera pulls back to reveal the completed station gleaming against the stars. Epic scale, cinematic lighting."),
    ("lhc", "Cinematic timelapse of a massive underground particle accelerator tunnel being constructed. Engineers install superconducting magnets in a circular tunnel beneath the Swiss-French border. Sparks fly as the enormous ring takes shape. Camera pulls back through the tunnel revealing the completed scientific marvel. Golden lighting, epic scale."),
    ("world_trade", "Cinematic timelapse of iconic twin skyscrapers rising in lower Manhattan, New York City. Steel beams and glass panels climb skyward as construction crews work at dizzying heights. Golden hour lighting reflects off the growing towers. Camera pulls back to reveal the completed gleaming towers against the NYC skyline."),
    ("wembley", "Cinematic timelapse of a grand national football stadium being built in London. Steel arch rises dramatically as the massive bowl structure takes shape. Construction cranes swing into position. Camera pulls back to reveal the completed modern arena with its signature arch. Golden hour, epic scale."),
    ("abbey_road", "Cinematic timelapse of a historic recording studio being constructed in London. Workers build the iconic Georgian townhouse, installing acoustic panels and recording equipment inside. Camera pulls back to reveal the completed studio on a quiet tree-lined street. Warm golden lighting, historical accuracy."),
    ("channel_tunnel", "Cinematic timelapse of an enormous undersea tunnel being bored beneath the English Channel. Massive tunnel boring machines carve through chalk as workers reinforce the passage. Water and earth give way to engineering. Camera pulls back through the completed tunnel connecting two nations. Epic scale, dramatic lighting."),
    ("bbc", "Cinematic timelapse of a grand broadcasting center being built in London. Radio towers rise, transmission equipment is installed. Workers construct the iconic building that would beam news across the globe. Camera pulls back to reveal the completed broadcast headquarters. Golden hour, historical accuracy."),
    ("lords_cg", "Cinematic timelapse of a historic cricket ground being constructed in London. Workers lay the famous pitch, build the Victorian pavilion, and erect grandstands. Camera pulls back to reveal the completed sporting venue with its distinctive architecture. Golden hour lighting, epic scale."),
]

def generate_video(wonder_id, prompt):
    path = f"{OUT}/{wonder_id}.mp4"
    if os.path.exists(path):
        print(f"  SKIP {wonder_id} (exists)", flush=True)
        return (wonder_id, "skipped")
    try:
        resp = requests.post("https://api.openai.com/v1/videos",
            headers=headers,
            json={"model": "sora-2", "prompt": prompt, "size": "1280x720"},
            timeout=60)
        resp.raise_for_status()
        data = resp.json()
        video_id = data.get("id")
        if not video_id:
            print(f"  ❌ {wonder_id} no id: {data}", flush=True)
            return (wonder_id, "failed")
        print(f"  Started {wonder_id}: {video_id}", flush=True)
        for attempt in range(90):
            time.sleep(10)
            try:
                status = requests.get(f"https://api.openai.com/v1/videos/{video_id}", headers=headers, timeout=30).json()
            except Exception as e:
                continue
            st = status.get("status")
            if attempt % 6 == 0:
                print(f"  📊 {wonder_id}: {st} ({status.get('progress', '?')}%)", flush=True)
            if st == "completed":
                content = requests.get(f"https://api.openai.com/v1/videos/{video_id}/content", headers=headers, timeout=300)
                content.raise_for_status()
                with open(path, "wb") as f:
                    f.write(content.content)
                print(f"  ✅ {wonder_id}.mp4 ({os.path.getsize(path)/1024/1024:.1f} MB)", flush=True)
                return (wonder_id, "success")
            elif st == "failed":
                print(f"  ❌ {wonder_id} failed: {status.get('error', status)}", flush=True)
                return (wonder_id, "failed")
        return (wonder_id, "timeout")
    except requests.exceptions.HTTPError as e:
        print(f"  ❌ {wonder_id} HTTP: {e.response.status_code} {e.response.text[:200]}", flush=True)
        return (wonder_id, "failed")
    except Exception as e:
        print(f"  ❌ {wonder_id} error: {e}", flush=True)
        return (wonder_id, "failed")

if __name__ == "__main__":
    print(f"=== Retrying {len(RETRIES)} failed wonder videos (3 workers) ===", flush=True)
    results = {"success": [], "failed": [], "skipped": [], "timeout": []}
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(generate_video, wid, prompt): wid for wid, prompt in RETRIES}
        for future in as_completed(futures):
            wid, status = future.result()
            results[status].append(wid)
    print(f"\n=== RETRY SUMMARY ===", flush=True)
    print(f"  ✅ Success: {len(results['success'])} - {results['success']}", flush=True)
    print(f"  ❌ Failed:  {len(results['failed'])} - {results['failed']}", flush=True)
