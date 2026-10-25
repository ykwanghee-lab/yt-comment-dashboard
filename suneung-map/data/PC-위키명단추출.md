# PC(Windows)에서 Claude Code가 할 일: 위키에서 시험장 명단만 뽑기 (약 10분)

클라우드와 GitHub 서버는 나무위키 접속이 막혀 있어(데이터센터 차단), 가정용 인터넷인 PC에서 이 한 가지만 한다.
주소·좌표 채우기, 검증, 배포는 클라우드 세션이 GitHub Actions로 처리한다.

## 할 일
1. 저장소 받기 (이미 있으면 `git pull`):
   ```powershell
   $W = "$env:USERPROFILE\work"; New-Item -ItemType Directory -Force $W | Out-Null; Set-Location $W
   if (-not (Test-Path yt-comment-dashboard)) { gh repo clone ykwanghee-lab/yt-comment-dashboard }
   Set-Location yt-comment-dashboard; git checkout main; git pull
   ```
2. 나무위키 문서 원문(위키 문법)을 받는다. 브라우저 같은 User-Agent를 붙인다.
   `https://namu.wiki/raw/대학수학능력시험/시험장`
   - 문서 안에 시·도별 하위 문서 링크(예: `[[대학수학능력시험/시험장/서울]]`)가 있으면 그것들도 받는다.
   - PowerShell `Invoke-WebRequest` 가 막히면 브라우저로 열어 내용을 확인하고 사용자에게 도움을 요청한다.
   - 받은 원문 파일은 **저장소에 커밋하지 않는다** (위키 본문은 저작물이다). 작업 폴더 밖 임시 폴더에 둔다.
3. 원문에서 **사실 정보만** 뽑아 `suneung-map/data/sites.csv` 를 만든다.
   - 문서가 어느 학년도 기준인지 먼저 확인해 사용자에게 알린다. 2026학년도(2025-11-13 시행)가 아니면 그 학년도를 적는다.
   - 열: `region_code,region_name,district_code,district_name,site_no,school_name,address,lat,lng,note`
   - `district_code` = 시험지구 번호 2자리, `site_no` = 시험장 번호 2자리. 문서 표기 그대로. 번호가 없으면 비우고 note 에 "번호없음".
   - `district_name` 은 `suneung-map/data/districts_2026.csv` 의 지구 이름과 맞춘다.
   - `region_code` 는 sites.csv 주석의 시·도 코드표를 따른다.
   - `address`, `lat`, `lng` 는 **비워 둔다** (클라우드 쪽에서 채운다). note 는 비우거나 위 표시만.
   - 맨 위 주석 줄과 헤더는 기존 sites.csv 형식을 유지하고, 샘플 7행은 지운다.
   - 학교명은 정식 명칭으로 (예: "경기고" → "경기고등학교"). 줄임말이 애매하면 note 에 "학교명확인".
4. 시·도별 시험장 수 표를 만들어 사용자에게 보여 준다. 공고상 전국 85개 지구, 1,310개 시험장(2026학년도)과 크게 다르면 그 이유를 적는다.
5. `sites.csv` 만 커밋해서 `main` 에 푸시한다. 커밋 메시지: "시험장 명단(위키, <학년도>) 추출".
6. 사용자에게 "클라우드 세션에 '명단 올렸어'라고 알려 주세요" 라고 안내한다.

## 하지 말 것
- 추측으로 빈 칸 채우기. 못 찾은 지역은 비우고 보고한다.
- `web/data/` 빌드, 주소·좌표 채우기 (클라우드가 한다).
- 위키 원문 파일 커밋.
