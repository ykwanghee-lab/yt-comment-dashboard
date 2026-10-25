#!/usr/bin/env python3
"""
sites.csv 에서 address 가 빈 행을 나이스(NEIS) 학교기본정보로 채운다.
GitHub Actions(인터넷 가능)에서 실행하는 것을 전제로 한다.

  python3 enrich_addresses.py            # 채우기
  python3 enrich_addresses.py --selftest # 경기고등학교 1건 조회만

환경변수 NEIS_KEY 가 있으면 사용한다 (없어도 학교명 단건 조회는 된다).
같은 이름 학교가 여러 개면 비워 두고 note 에 '동명학교확인' 을 적는다.
"""
import csv, json, os, re, sys, time, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
CSV_PATH = os.path.join(HERE, "sites.csv")
OFFICE = {"11": "B10", "26": "C10", "27": "D10", "28": "E10", "29": "F10", "30": "G10", "31": "H10", "36": "I10",
          "41": "J10", "42": "K10", "43": "M10", "44": "N10", "45": "P10", "46": "Q10", "47": "R10", "48": "S10", "50": "T10"}

def neis(name, office):
    q = {"Type": "json", "pIndex": 1, "pSize": 5, "SCHUL_NM": name, "ATPT_OFCDC_SC_CODE": office}
    if os.environ.get("NEIS_KEY"):
        q["KEY"] = os.environ["NEIS_KEY"]
    url = "https://open.neis.go.kr/hub/schoolInfo?" + urllib.parse.urlencode(q)
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "suneung-map"}), timeout=20) as r:
        d = json.load(r)
    if "schoolInfo" not in d:
        return []
    rows = d["schoolInfo"][1]["row"]
    exact = [x for x in rows if x["SCHUL_NM"] == name]
    return exact or rows

def nominatim_school(name, region):
    # 나이스에 없는 학교(개명·폐교·병원 등): 지도 검색 결과에 학교 이름과 시·도가 모두 있을 때만 받아들인다
    time.sleep(1.1)
    url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
        {"q": f"{name} {region}", "format": "json", "limit": 3, "countrycodes": "kr", "accept-language": "ko"})
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "suneung-map-data-builder/1.0"}), timeout=20) as r:
        docs = json.load(r)
    for d in docs:
        dn = d.get("display_name", "")
        if name in dn and region in dn:
            return dn, float(d["lat"]), float(d["lon"])
    return None

def pick_by_district(hits, district_name):
    # 같은 이름 학교가 여럿이면 시험지구 이름의 두 글자 조각이 주소에 들어 있는 학교만 남긴다 (예: 안양과천 -> 안양, 과천)
    parts = {district_name[i:i + 2] for i in range(len(district_name) - 1)}
    keep = [h for h in hits if any(p in h["ORG_RDNMA"] for p in parts)]
    return keep

def main():
    if "--selftest" in sys.argv:
        print(neis("경기고등학교", "B10")[0]["ORG_RDNMA"]); return
    lines = open(CSV_PATH, encoding="utf-8").read().splitlines()
    head = [l for l in lines if l.startswith("#")]
    body = [l for l in lines if l and not l.startswith("#")]
    rows = list(csv.DictReader(body)); fields = body[0].split(",")
    filled = amb = miss = 0
    for r in rows:
        if r.get("address"):
            continue
        office = OFFICE.get(r["region_code"])
        try:
            qname = re.sub(r"\(.*?\)", "", r["school_name"]).strip()
            hits = neis(qname, office) if office else []
        except Exception as e:
            hits = []; print("ERR", r["school_name"], e, file=sys.stderr)
        time.sleep(0.3)
        if len(hits) > 1:
            hits = pick_by_district(hits, r["district_name"]) or hits
        if len(hits) == 1:
            r["address"] = hits[0]["ORG_RDNMA"].strip(); filled += 1
        elif len(hits) > 1:
            r["note"] = (r.get("note") or "") + " 동명학교확인"; amb += 1
        else:
            try:
                g = nominatim_school(qname, r["region_name"])
            except Exception as e:
                g = None; print("ERR nominatim", r["school_name"], e, file=sys.stderr)
            if g:
                r["address"], r["lat"], r["lng"] = g[0], f"{g[1]:.6f}", f"{g[2]:.6f}"
                r["note"] = (r.get("note") or "") + " 지도검색주소"; filled += 1
            else:
                r["note"] = (r.get("note") or "") + " 주소없음"; miss += 1
                print("주소없음:", r["region_name"], r["district_name"], r["school_name"])
    with open(CSV_PATH, "w", encoding="utf-8", newline="") as f:
        f.write("\n".join(head) + "\n")
        w = csv.DictWriter(f, fieldnames=fields); w.writeheader(); w.writerows(rows)
    print(f"주소 채움 {filled}, 동명학교 {amb}, 못 찾음 {miss}")

if __name__ == "__main__":
    main()
