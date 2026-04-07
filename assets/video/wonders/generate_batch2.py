import requests, time, os, sys
from concurrent.futures import ThreadPoolExecutor, as_completed

OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
headers = {"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"}
OUT = "/root/tileforge/assets/video/wonders"
os.makedirs(OUT, exist_ok=True)

WONDERS = [
    ("panama_canal", "Panama Canal", "industrial"),
    ("christ_redeemer", "Christ the Redeemer", "industrial"),
    ("golden_gate", "Golden Gate Bridge", "industrial"),
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
    ("bbc", "BBC World Service", "modern"),
    ("lords_cg", "Lord's Cricket Ground", "modern"),
    ("internet", "Internet", "ai"),
]

def generate_video(wonder_id, wonder_name, era):
    path = f"{OUT}/{wonder_id}.mp4"
    if os.path.exists(path):
        print(f"  SKIP {wonder_id} (exists)", flush=True)
        return (wonder_id, "skipped")
    prompt = (
        f"Cinematic timelapse of the construction of {wonder_name}, a wonder of the {era} era. "
        f"Workers building the structure from foundation to completion. Golden hour lighting, epic scale, "
        f"historical accuracy. Camera slowly pulls back to reveal the finished monument. 4K quality cinematic footage."
    )
    try:
        # POST /v1/videos to create render job
        resp = requests.post("https://api.openai.com/v1/videos",
            headers=headers,
            json={"model": "sora-2", "prompt": prompt, "size": "1280x720"},
            timeout=60)
        resp.raise_for_status()
        data = resp.json()
        video_id = data.get("id")
        if not video_id:
            print(f"  ❌ {wonder_id} no id in response: {data}", flush=True)
            return (wonder_id, "failed")
        print(f"  Started {wonder_id}: {video_id}", flush=True)
        # Poll GET /v1/videos/{video_id} until completed
        for attempt in range(90):
            time.sleep(10)
            try:
                status_resp = requests.get(f"https://api.openai.com/v1/videos/{video_id}",
                    headers=headers, timeout=30)
                status = status_resp.json()
            except Exception as e:
                print(f"  ⚠ {wonder_id} poll error: {e}", flush=True)
                continue
            st = status.get("status")
            progress = status.get("progress", "?")
            if attempt % 6 == 0:
                print(f"  📊 {wonder_id}: {st} ({progress}%)", flush=True)
            if st == "completed":
                try:
                    content = requests.get(f"https://api.openai.com/v1/videos/{video_id}/content",
                        headers=headers, timeout=300)
                    content.raise_for_status()
                    with open(path, "wb") as f:
                        f.write(content.content)
                    size_mb = os.path.getsize(path) / 1024 / 1024
                    print(f"  ✅ {wonder_id}.mp4 ({size_mb:.1f} MB)", flush=True)
                    return (wonder_id, "success")
                except Exception as e:
                    print(f"  ❌ {wonder_id} download error: {e}", flush=True)
                    return (wonder_id, "failed")
            elif st == "failed":
                print(f"  ❌ {wonder_id} failed: {status}", flush=True)
                return (wonder_id, "failed")
        print(f"  ⏰ {wonder_id} timed out after 15 min", flush=True)
        return (wonder_id, "timeout")
    except requests.exceptions.HTTPError as e:
        print(f"  ❌ {wonder_id} HTTP error: {e.response.status_code} {e.response.text[:200]}", flush=True)
        return (wonder_id, "failed")
    except Exception as e:
        print(f"  ❌ {wonder_id} error: {e}", flush=True)
        return (wonder_id, "failed")

if __name__ == "__main__":
    print(f"=== Generating {len(WONDERS)} wonder videos (3 concurrent workers) ===", flush=True)
    results = {"success": [], "failed": [], "skipped": [], "timeout": []}
    with ThreadPoolExecutor(max_workers=3) as pool:
        futures = {pool.submit(generate_video, wid, wname, era): wid for wid, wname, era in WONDERS}
        for future in as_completed(futures):
            wid, status = future.result()
            results[status].append(wid)

    print("\n=== SUMMARY ===", flush=True)
    print(f"  ✅ Success: {len(results['success'])} - {results['success']}", flush=True)
    print(f"  ⏭ Skipped: {len(results['skipped'])} - {results['skipped']}", flush=True)
    print(f"  ❌ Failed:  {len(results['failed'])} - {results['failed']}", flush=True)
    print(f"  ⏰ Timeout: {len(results['timeout'])} - {results['timeout']}", flush=True)
