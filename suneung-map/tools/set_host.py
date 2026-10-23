#!/usr/bin/env python3
"""
웹앱 배포 주소를 한 번에 바꾼다. (GitHub Pages -> Render 등)

사용법:
  python3 suneung-map/tools/set_host.py suneung-map.onrender.com
  python3 suneung-map/tools/set_host.py suneung-map.onrender.com --path /     (기본값 /)

바꾸는 곳: Android 앱 시작 주소·신원 확인 대상, 웹 매니페스트 id, 스토어 문서의 개인정보처리방침·웹사이트 주소.
assetlinks.json 은 상대 경로(web/.well-known/)로 배포되므로 내용은 그대로 둔다.
"""
import re, sys, os, argparse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OLD_HOST = "ykwanghee-lab.github.io"
OLD_PATH = "/yt-comment-dashboard/suneung-map/web/"

def sub(path, pairs):
    p = os.path.join(ROOT, path)
    s = open(p, encoding="utf-8").read()
    t = s
    for a, b in pairs:
        t = t.replace(a, b)
    if t != s:
        open(p, "w", encoding="utf-8").write(t)
        print("updated", path)
    return t

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("host")
    ap.add_argument("--path", default="/")
    a = ap.parse_args()
    host = a.host.replace("https://", "").strip("/")
    path = "/" + a.path.strip("/") + "/" if a.path.strip("/") else "/"
    base = f"https://{host}{path}"
    old_base = f"https://{OLD_HOST}{OLD_PATH}"

    sub("android/app/build.gradle.kts", [
        (f'val siteHost = "{OLD_HOST}"', f'val siteHost = "{host}"'),
        (f'val sitePath = "{OLD_PATH}"', f'val sitePath = "{path}"'),
    ])
    sub("android/app/src/main/res/values/strings.xml", [
        (old_base, base),
        (f'\\"site\\": \\"https://{OLD_HOST}\\"', f'\\"site\\": \\"https://{host}\\"'),
    ])
    sub("web/manifest.webmanifest", [(f'"id": "{OLD_PATH}"', f'"id": "{path}"')])
    for doc in ["store/listing.md", "store/play-console-답안지.md"]:
        sub(doc, [(old_base, base)])

    # 남은 옛 주소 점검 (문서의 설명문 제외)
    left = []
    for rel in ["android/app/build.gradle.kts", "android/app/src/main/res/values/strings.xml", "web/manifest.webmanifest"]:
        if OLD_HOST in open(os.path.join(ROOT, rel), encoding="utf-8").read() or OLD_PATH in open(os.path.join(ROOT, rel), encoding="utf-8").read():
            left.append(rel)
    if left:
        sys.exit("옛 주소가 남아 있음: " + ", ".join(left))
    print("OK ->", base)

if __name__ == "__main__":
    main()
