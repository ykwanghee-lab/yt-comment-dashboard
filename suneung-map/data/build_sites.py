#!/usr/bin/env python3
"""
sites.csv -> web/data/sites.json 변환기

사용법:
  python3 build_sites.py                 # 변환 + 검증
  python3 build_sites.py --geocode       # lat/lng 빈 행 지오코딩: KAKAO_REST_KEY 있으면 카카오, 없으면 OpenStreetMap(Nominatim, 1초 1건)
  python3 build_sites.py --status official --version 2027-1
  python3 build_sites.py --status provisional --basis-year 2026학년도   # 작년 명단: 앱에서 수험번호 조회가 잠김

검증 규칙:
  - district_code(2자리) + site_no(2자리) = 4자리 id 가 전국에서 유일해야 함
  - lat/lng 가 한국 범위(33~39, 124~132) 안이어야 함
"""
import argparse, csv, json, os, sys, urllib.parse, urllib.request
from datetime import datetime, timezone, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(HERE, "sites.csv")
OUT_PATH = os.path.join(HERE, "..", "web", "data", "sites.json")

EXAM = {
    "examYear": "2027학년도",
    "examDate": "2026-11-19",        # 목
    "preAssemblyDate": "2026-11-18", # 예비소집일(수험표 교부)
    "entryDeadline": "08:10",        # 시험실 입실 완료
    "gateOpen": "06:30",
}

def geocode_kakao(addr, key):
    url = "https://dapi.kakao.com/v2/local/search/address.json?" + urllib.parse.urlencode({"query": addr})
    req = urllib.request.Request(url, headers={"Authorization": f"KakaoAK {key}"})
    with urllib.request.urlopen(req, timeout=10) as r:
        docs = json.load(r).get("documents", [])
    if not docs:
        return None
    return float(docs[0]["y"]), float(docs[0]["x"])

CACHE_PATH = os.path.join(HERE, "geocode_cache.json")

def geocode_nominatim(addr):
    import time
    time.sleep(1.1)  # Nominatim 이용 정책: 초당 1건
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": addr, "format": "json", "limit": 1, "countrycodes": "kr"})
    req = urllib.request.Request(url, headers={"User-Agent": "suneung-map-data-builder/1.0"})
    with urllib.request.urlopen(req, timeout=15) as r:
        docs = json.load(r)
    if not docs:
        return None
    return float(docs[0]["lat"]), float(docs[0]["lon"])

def geocode(addr, key, cache):
    if addr in cache:
        return tuple(cache[addr]) if cache[addr] else None
    g = geocode_kakao(addr, key) if key else geocode_nominatim(addr)
    cache[addr] = list(g) if g else None
    return g

def geocode_poi(name, addr, cache):
    import re, time
    q = re.sub(r"\(.*?\)", "", name).strip()
    toks = addr.split()
    area = toks[1] if len(toks) > 1 else ""          # 시·군·구 (예: 강동구, 수원시)
    ck = f"@poi:{q}:{area}"
    if ck in cache:
        return tuple(cache[ck]) if cache[ck] else None
    time.sleep(1.1)
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": f"{q} {area}", "format": "json", "limit": 5, "countrycodes": "kr", "accept-language": "ko"})
    req = urllib.request.Request(url, headers={"User-Agent": "suneung-map-data-builder/1.0"})
    g = None
    with urllib.request.urlopen(req, timeout=15) as r:
        docs = json.load(r)
    for d in docs:
        dn = d.get("display_name", "")
        first = dn.split(",")[0].strip()
        # 결과의 이름이 학교명과 같고(부분 일치 X), 같은 시·군·구일 때만
        if first == q and (not area or area in dn):
            g = (float(d["lat"]), float(d["lon"])); break
    cache[ck] = list(g) if g else None
    return g

def geocode_school(name, region, cache):
    import re, time
    q = re.sub(r"\(.*?\)", "", name).strip()
    ck = f"@school:{q}:{region}"
    if ck in cache:
        return tuple(cache[ck]) if cache[ck] else None
    time.sleep(1.1)
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": f"{q} {region}", "format": "json", "limit": 3, "countrycodes": "kr", "accept-language": "ko"})
    req = urllib.request.Request(url, headers={"User-Agent": "suneung-map-data-builder/1.0"})
    g = None
    with urllib.request.urlopen(req, timeout=15) as r:
        for d in json.load(r):
            if q in d.get("display_name", "") and region in d.get("display_name", ""):
                g = (float(d["lat"]), float(d["lon"])); break
    cache[ck] = list(g) if g else None
    return g

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--geocode", action="store_true")
    ap.add_argument("--status", default=None, help="sample | provisional | official")
    ap.add_argument("--basis-year", default=None, help="provisional 일 때 기준 학년도 (예: 2026학년도)")
    ap.add_argument("--version", default=None)
    args = ap.parse_args()

    rows = []
    with open(CSV_PATH, encoding="utf-8") as f:
        for line in f:
            if line.startswith("#") or not line.strip():
                continue
            rows.append(line)
    reader = csv.DictReader(rows)

    key = os.environ.get("KAKAO_REST_KEY")
    cache = {}
    if os.path.exists(CACHE_PATH):
        cache = json.load(open(CACHE_PATH, encoding="utf-8"))

    regions, sites, ids, errors = {}, [], set(), []
    seen_school, skipped, special_n = set(), [], {}
    all_sample = True
    for r in reader:
        r = {k: (v or "").strip() for k, v in r.items()}
        skey = (r["region_code"], r["school_name"])
        if skey in seen_school:
            # 여러 학년도 자료가 섞이면 같은 학교가 번호만 바뀌어 두 번 나온다. 처음 것만 둔다.
            skipped.append(f"{r['region_name']} {r['school_name']} ({r['district_code']}-{r['site_no'] or '별도'})"); continue
        seen_school.add(skey)
        if r["site_no"]:
            sid = f"{r['district_code']:0>2}{r['site_no']:0>2}"
            if len(sid) != 4 or not sid.isdigit():
                errors.append(f"잘못된 id: {r}"); continue
        else:
            # 번호 없는 별도 시험장(편의 시험장, 병원 등): 수험번호 조회 대상이 아니므로 S 접두 id
            special_n[r["district_code"]] = special_n.get(r["district_code"], 0) + 1
            sid = f"{r['district_code']:0>2}S{special_n[r['district_code']]}"
            r["note"] = "별도시험장"
        if sid in ids:
            errors.append(f"중복 id {sid}: {r['school_name']}"); continue
        ids.add(sid)
        lat, lng = r.get("lat"), r.get("lng")
        geo = "given" if (lat and lng) else ""
        if (not lat or not lng) and args.geocode and r["address"]:
            # 1순위: 학교 이름으로 학교 부지·건물 자체를 찾는다 (도로 중간점 오차 방지)
            g, geo = geocode_poi(r["school_name"], r["address"], cache), "poi"
            if not g:
                g, geo = geocode(r["address"], key, cache), "addr"
            if not g:
                g, geo = geocode_school(r["school_name"], r["region_name"], cache), "name"
            if g: lat, lng = g
            else: print(f"WARN 지오코딩 실패: {r['school_name']} {r['address']}")
        try:
            lat, lng = float(lat), float(lng)
        except (ValueError, TypeError):
            msg = f"좌표 없음: {r['region_name']} {r['school_name']}"
            if (args.status or "") == "official":
                errors.append(msg)
            else:
                skipped.append(msg + " (앱에서 제외)")
            ids.discard(sid); continue
        if not (33 <= lat <= 39 and 124 <= lng <= 132):
            errors.append(f"좌표 범위 밖: {r['school_name']} {lat},{lng}")
        if r.get("note") != "샘플":
            all_sample = False
        reg = regions.setdefault(r["region_code"], {"code": r["region_code"], "name": r["region_name"], "districts": {}})
        reg["districts"].setdefault(r["district_code"], {"code": r["district_code"], "name": r["district_name"]})
        sites.append({
            "id": sid, "region": r["region_code"], "district": r["district_code"], "siteNo": f"{r['site_no']:0>2}" if r["site_no"] else "",
            "name": r["school_name"], "addr": r["address"], "lat": round(lat, 6), "lng": round(lng, 6),
            **({"geo": geo} if geo else {}),
            **({"note": r["note"]} if r.get("note") else {}),
        })

    if args.geocode:
        with open(CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump(cache, f, ensure_ascii=False, indent=0)
    if skipped:
        print(f"제외 {len(skipped)}건: " + "; ".join(skipped))
    if errors:
        print("\n".join("ERROR " + e for e in errors), file=sys.stderr)
        sys.exit(1)

    kst = timezone(timedelta(hours=9))
    now = datetime.now(kst)
    status = args.status or ("sample" if all_sample else "official")
    out = {
        "version": args.version or now.strftime("%Y%m%d-%H%M"),
        "status": status,
        **({"basisYear": args.basis_year} if args.basis_year else {}),
        "updatedAt": now.isoformat(timespec="seconds"),
        **EXAM,
        "regions": [
            {"code": g["code"], "name": g["name"], "districts": sorted(g["districts"].values(), key=lambda d: d["code"])}
            for g in sorted(regions.values(), key=lambda g: g["code"])
        ],
        "sites": sorted(sites, key=lambda s: s["id"]),
    }
    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    # file:// 로 직접 열었을 때(fetch 불가)를 위한 스크립트 버전
    with open(OUT_PATH[:-5] + ".js", "w", encoding="utf-8") as f:
        f.write("window.__SITES__ = " + json.dumps(out, ensure_ascii=False) + ";\n")
    print(f"OK: {len(sites)} sites, {len(regions)} regions, status={status} -> {os.path.relpath(OUT_PATH, HERE)}")

if __name__ == "__main__":
    main()
