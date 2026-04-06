#!/usr/bin/env python3
"""Generate 48x48 transparent PNG unit sprites for Apollo's Time."""
from PIL import Image, ImageDraw
import math, os

OUT = '/root/tileforge/assets/units'
SIZE = 48

ERA_COLORS = {
    'caveman':     ((101, 67, 33),  (160, 120, 80)),
    'ancient':     ((139, 119, 42), (200, 180, 80)),
    'classical':   ((120, 50, 50),  (200, 80, 80)),
    'medieval':    ((70, 70, 100),  (120, 120, 180)),
    'renaissance': ((100, 60, 100), (170, 100, 170)),
    'industrial':  ((80, 80, 80),   (140, 140, 140)),
    'modern':      ((40, 80, 40),   (80, 160, 80)),
    'ai':          ((20, 60, 100),  (60, 140, 220)),
    'mars':        ((100, 30, 30),  (220, 80, 60)),
}

def draw_land_melee(d, c1, c2):
    pts = [(24,4),(40,14),(40,34),(24,44),(8,34),(8,14)]
    d.polygon(pts, fill=c1, outline=c2, width=2)
    d.line([(24,12),(24,36)], fill=c2, width=2)
    d.line([(17,20),(31,20)], fill=c2, width=2)

def draw_land_ranged(d, c1, c2):
    d.ellipse([8,8,40,40], fill=c1, outline=c2, width=2)
    d.line([(24,10),(24,38)], fill=c2, width=1)
    d.line([(10,24),(38,24)], fill=c2, width=1)
    d.ellipse([18,18,30,30], outline=c2, width=1)

def draw_land_mounted(d, c1, c2):
    pts = [(24,4),(42,24),(24,18),(6,24)]
    d.polygon(pts, fill=c1, outline=c2, width=2)
    pts2 = [(24,22),(42,42),(24,36),(6,42)]
    d.polygon(pts2, fill=c1, outline=c2, width=2)

def draw_land_siege(d, c1, c2):
    cx, cy = 24, 24
    for i in range(8):
        a = math.radians(i * 45)
        x1 = cx + int(8 * math.cos(a))
        y1 = cy + int(8 * math.sin(a))
        x2 = cx + int(18 * math.cos(a))
        y2 = cy + int(18 * math.sin(a))
        d.line([(x1,y1),(x2,y2)], fill=c2, width=2)
    d.ellipse([14,14,34,34], fill=c1, outline=c2, width=2)

def draw_land_anti_cav(d, c1, c2):
    pts = [(24,4),(40,24),(24,44),(8,24)]
    d.polygon(pts, fill=c1, outline=c2, width=2)
    d.line([(24,8),(24,40)], fill=c2, width=2)
    d.polygon([(24,4),(20,12),(28,12)], fill=c2)

def draw_land_armor(d, c1, c2):
    d.rounded_rectangle([6,10,42,38], radius=4, fill=c1, outline=c2, width=2)
    d.rounded_rectangle([10,14,38,34], radius=2, outline=c2, width=1)
    d.ellipse([17,17,31,31], fill=c2, outline=c1, width=1)
    d.line([(24,18),(24,6)], fill=c2, width=3)

def draw_land_recon(d, c1, c2):
    pts = [(6,24),(24,8),(42,24),(24,40)]
    d.polygon(pts, fill=c1, outline=c2, width=2)
    d.ellipse([17,17,31,31], fill=c2)
    d.ellipse([20,20,28,28], fill=c1)

def draw_civilian(d, c1, c2):
    d.ellipse([8,8,40,40], fill=c1, outline=c2, width=2)
    d.ellipse([20,12,28,20], fill=c2)
    d.polygon([(18,22),(30,22),(32,36),(16,36)], fill=c2)

def draw_settler(d, c1, c2):
    d.ellipse([8,8,40,40], fill=c1, outline=c2, width=2)
    d.polygon([(24,10),(36,28),(12,28)], fill=c2)
    d.rectangle([16,28,32,38], fill=c2)

def draw_sea(d, c1, c2):
    pts = [(24,6),(42,24),(24,42),(6,24)]
    d.polygon(pts, fill=c1, outline=c2, width=2)
    for y in [20, 28]:
        pts_w = []
        for x in range(12, 37, 2):
            pts_w.append((x, y + int(2 * math.sin(x * 0.5))))
        if len(pts_w) > 1:
            d.line(pts_w, fill=c2, width=1)

def draw_air(d, c1, c2):
    pts = [(24,4),(44,38),(24,32),(4,38)]
    d.polygon(pts, fill=c1, outline=c2, width=2)
    d.line([(24,6),(24,34)], fill=c2, width=2)

def draw_special(d, c1, c2):
    cx, cy = 24, 24
    hex_pts = []
    for i in range(6):
        a = math.radians(60 * i - 30)
        hex_pts.append((cx + int(18 * math.cos(a)), cy + int(18 * math.sin(a))))
    d.polygon(hex_pts, fill=c1, outline=c2, width=2)
    d.polygon([(24,12),(30,28),(18,28)], fill=c2)
    d.ellipse([21,30,27,36], fill=c2)

TYPE_DRAWERS = {
    'melee': draw_land_melee, 'ranged': draw_land_ranged,
    'mounted': draw_land_mounted, 'siege': draw_land_siege,
    'anti_cav': draw_land_anti_cav, 'armor': draw_land_armor,
    'recon': draw_land_recon, 'civilian': draw_civilian,
    'settler': draw_settler, 'naval_melee': draw_sea,
    'naval_ranged': draw_sea, 'naval_stealth': draw_sea,
    'naval_capital': draw_sea, 'hybrid': draw_sea,
    'air_fighter': draw_air, 'air_bomber': draw_air,
    'special': draw_special, 'victory': draw_air,
}

UNITS = [
    ("gatherer","Gatherer","caveman","land","civilian"),
    ("nomad","Nomad","caveman","land","settler"),
    ("worker","Worker","ancient","land","civilian"),
    ("settler","Settler","ancient","land","settler"),
    ("club_warrior","Club Warrior","caveman","land","melee"),
    ("rock_thrower","Rock Thrower","caveman","land","ranged"),
    ("scout","Scout","caveman","land","recon"),
    ("log_raft","Log Raft","caveman","sea","naval_melee"),
    ("warrior","Warrior","ancient","land","melee"),
    ("spearman","Spearman","ancient","land","anti_cav"),
    ("archer","Archer","ancient","land","ranged"),
    ("horseman","Horseman","ancient","land","mounted"),
    ("galley","Galley","ancient","sea","naval_melee"),
    ("war_canoe","War Canoe","ancient","sea","hybrid"),
    ("swordsman","Swordsman","classical","land","melee"),
    ("catapult","Catapult","classical","land","siege"),
    ("trireme","Trireme","classical","sea","naval_melee"),
    ("bireme","Bireme","classical","sea","naval_ranged"),
    ("longswordsman","Longswordsman","medieval","land","melee"),
    ("crossbowman","Crossbowman","medieval","land","ranged"),
    ("knight","Knight","medieval","land","mounted"),
    ("trebuchet","Trebuchet","medieval","land","siege"),
    ("caravel","Caravel","medieval","sea","naval_melee"),
    ("pikeman","Pikeman","medieval","land","anti_cav"),
    ("cog","Cog","medieval","sea","naval_melee"),
    ("fire_ship","Fire Ship","medieval","sea","naval_melee"),
    ("landing_barge","Landing Barge","medieval","sea","hybrid"),
    ("musketman","Musketman","renaissance","land","melee"),
    ("cannon","Cannon","renaissance","land","siege"),
    ("frigate","Frigate","renaissance","sea","naval_ranged"),
    ("marine","Marine","renaissance","land","melee"),
    ("lancer","Lancer","renaissance","land","mounted"),
    ("privateer","Privateer","renaissance","sea","naval_melee"),
    ("rifleman","Rifleman","industrial","land","melee"),
    ("cavalry","Cavalry","industrial","land","mounted"),
    ("artillery","Artillery","industrial","land","siege"),
    ("ironclad","Ironclad","industrial","sea","naval_melee"),
    ("gatling_gun","Gatling Gun","industrial","land","ranged"),
    ("destroyer","Destroyer","industrial","sea","naval_ranged"),
    ("transport_ship","Transport Ship","industrial","sea","naval_melee"),
    ("observation_balloon","Observation Balloon","industrial","air","recon"),
    ("amphibious_barge","Amphibious Gun Barge","industrial","sea","hybrid"),
    ("infantry","Infantry","modern","land","melee"),
    ("tank","Tank","modern","land","armor"),
    ("rocket_artillery","Rocket Artillery","modern","land","siege"),
    ("fighter","Fighter","modern","air","air_fighter"),
    ("bomber","Bomber","modern","air","air_bomber"),
    ("battleship","Battleship","modern","sea","naval_ranged"),
    ("submarine","Submarine","modern","sea","naval_stealth"),
    ("machine_gun","Machine Gun","modern","land","ranged"),
    ("paratrooper","Paratrooper","modern","land","melee"),
    ("aircraft_carrier","Aircraft Carrier","modern","sea","naval_capital"),
    ("tactical_nuke","Tactical Nuke","modern","air","special"),
    ("seaplane","Seaplane","modern","air","hybrid"),
    ("cyber_infantry","Cyber Infantry","ai","land","melee"),
    ("mech_walker","Mech Walker","ai","land","armor"),
    ("drone_swarm","Drone Swarm","ai","air","air_fighter"),
    ("railgun","Railgun","ai","land","siege"),
    ("stealth_bomber","Stealth Bomber","ai","air","air_bomber"),
    ("autonomous_sub","Autonomous Sub","ai","sea","naval_stealth"),
    ("assault_vtol","Assault VTOL","ai","air","hybrid"),
    ("hovercraft","Hovercraft","ai","sea","hybrid"),
    ("cyber_ops","Cyber Ops","ai","land","special"),
    ("icbm","ICBM","ai","air","special"),
    ("titan_mech","Titan Mech","mars","land","armor"),
    ("mars_shuttle","Mars Shuttle","mars","air","victory"),
    ("exo_soldier","Exo Soldier","mars","land","melee"),
    ("plasma_artillery","Plasma Artillery","mars","land","siege"),
    ("hypersonic","Hypersonic Interceptor","mars","air","air_fighter"),
    ("orbital_drone","Orbital Strike Drone","mars","air","air_bomber"),
    ("fusion_battlecruiser","Fusion Battlecruiser","mars","sea","naval_capital"),
    ("ekranoplan","Ekranoplan","mars","sea","hybrid"),
]

if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    for u in UNITS:
        uid, name, era, domain, utype = u
        img = Image.new('RGBA', (SIZE, SIZE), (0, 0, 0, 0))
        d = ImageDraw.Draw(img)
        c1, c2 = ERA_COLORS.get(era, ((80,80,80),(160,160,160)))
        drawer = TYPE_DRAWERS.get(utype, draw_land_melee)
        if utype == 'hybrid':
            drawer = draw_sea if domain == 'sea' else draw_air
        drawer(d, c1, c2)
        img.save(os.path.join(OUT, f'{uid}.png'), 'PNG')
    print(f'Generated {len(UNITS)} unit sprites in {OUT}')
