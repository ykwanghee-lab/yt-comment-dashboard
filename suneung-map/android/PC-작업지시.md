# PC(Windows)에서 Claude Code가 할 일: 서명 키, 사용자 사이트, 서명된 AAB

이 문서는 사용자의 Windows PC에서 실행되는 Claude Code를 위한 작업 지시서다.
클라우드 세션은 비밀값 저장소에 쓸 권한이 없어서, 사용자 본인의 GitHub 로그인이 있는 PC에서 이 작업을 한다.
사용자는 비개발자다. 로그인·승인처럼 사람이 해야 하는 단계만 쉬운 말로 요청하고, 나머지는 직접 처리한다.

## 지켜야 할 것
- **서명 비밀번호를 화면이나 대화에 출력하지 않는다.** 파일로만 다루고, 명령에는 파일에서 읽어 넘긴다.
- 키 원본(`upload.jks`)과 비밀번호 파일은 저장소에 커밋하지 않는다. 저장소에는 암호화본(`upload.jks.enc`)만 둔다.
- 저장소 루트의 `index.html`, `channels.html` 등 유튜브 대시보드 파일은 건드리지 않는다. 바꾸는 것은 `suneung-map/` 아래뿐이다.
- 작업 브랜치는 `main`. 커밋 메시지는 한국어로 짧게.

## 0. 준비 확인
PowerShell에서 아래가 모두 되는지 확인하고, 없는 것만 설치한다.
| 도구 | 확인 | 없으면 |
|---|---|---|
| git | `git --version` | `winget install Git.Git` |
| GitHub CLI | `gh --version` | `winget install GitHub.cli` |
| GitHub 로그인 | `gh auth status` | `gh auth login` (사용자에게 브라우저 승인 요청) |
| JDK(keytool) | `keytool -help` | `winget install EclipseAdoptium.Temurin.17.JDK` 후 새 터미널 |
| openssl | `openssl version` | Git for Windows에 포함: `& "C:\Program Files\Git\usr\bin\openssl.exe" version` |

## 1. 저장소 받기
```powershell
$W = "$env:USERPROFILE\work"; New-Item -ItemType Directory -Force $W | Out-Null; Set-Location $W
if (-not (Test-Path yt-comment-dashboard)) { gh repo clone ykwanghee-lab/yt-comment-dashboard }
Set-Location yt-comment-dashboard; git checkout main; git pull
```

## 2. 새 업로드 키 만들기 (비밀번호는 파일로만)
키는 저장소 밖 `%USERPROFILE%\Documents\suneung-map-keys\`에 둔다.

> **안전장치: 키가 이미 있으면 절대 새로 만들지 않는다.**
> 업로드 키는 Play Console에 이미 등록되어 있다(SHA-256 `64:E8:00:D1:…:48:7F:63`, `README.md` 참고).
> 키를 새로 만들면 다음 업데이트를 구글이 거부한다. 아래 확인에서 멈추면 **2·3단계를 모두 건너뛰고** 4단계로 간다.
> 키 폴더가 없어졌으면 새로 만들지 말고 백업(`D:\suneung-map-keys`, 구글 드라이브 `내 드라이브\suneung-map-keys`)에서 복사해 온다.

```powershell
$K = "$env:USERPROFILE\Documents\suneung-map-keys"
$backups = @("D:\suneung-map-keys", "G:\내 드라이브\suneung-map-keys")
$existing = @($K) + $backups | Where-Object { (Test-Path "$_\upload.jks") -or (Test-Path "$_\password.txt") }
if ($existing) { throw "업로드 키가 이미 있습니다($($existing -join ', ')). 새로 만들지 않고 멈춥니다. 2·3단계를 건너뛰세요." }
New-Item -ItemType Directory -Force $K | Out-Null
$chars = [char[]](48..57 + 65..90 + 97..122)
$pw = -join (1..28 | ForEach-Object { $chars | Get-Random })
Set-Content -Path "$K\password.txt" -Value $pw -NoNewline -Encoding ascii
Remove-Variable pw
keytool -genkeypair -keystore "$K\upload.jks" -storetype PKCS12 -alias upload -keyalg RSA -keysize 4096 -validity 10950 `
  -storepass:file "$K\password.txt" -keypass:file "$K\password.txt" -dname "CN=Suneung Map, O=Suneung Map, C=KR"
keytool -list -v -keystore "$K\upload.jks" -storepass:file "$K\password.txt" | Select-String "SHA256:"
```
마지막 줄의 SHA-256 지문을 기록해 둔다 (지문은 비밀이 아니다).
사용자에게 알린다: "`문서\suneung-map-keys` 폴더를 USB나 개인 클라우드에 백업해 두세요. 잃어버리면 앱 업데이트 때 구글에 키 재설정을 요청해야 합니다."

## 3. 암호화본 교체 + GitHub 비밀값 등록
2단계에서 키를 새로 만든 경우에만 실행한다. 2단계 안전장치에서 멈췄으면 이 단계도 건너뛴다.
```powershell
openssl enc -aes-256-cbc -pbkdf2 -iter 200000 -salt -in "$K\upload.jks" -out suneung-map\android\upload.jks.enc -pass "file:$K\password.txt"
Get-Content -Raw "$K\password.txt" | gh secret set UPLOAD_KEYSTORE_PASSWORD -R ykwanghee-lab/yt-comment-dashboard
gh secret list -R ykwanghee-lab/yt-comment-dashboard
```
복호화 검증: 임시 파일로 복호화해 원본과 바이트가 같은지 확인하고 임시 파일은 지운다.

## 4. 지문 반영
- `suneung-map/web/.well-known/assetlinks.json` 의 `sha256_cert_fingerprints` 를 2단계 지문 하나로 바꾼다.
- `suneung-map/android/README.md` 의 "업로드 키 SHA-256" 값도 같은 지문으로 바꾼다.
- 커밋하고 `git push origin main`. 이 푸시가 `Android AAB 빌드` 워크플로를 자동 실행한다.

## 5. 서명된 AAB 받기
```powershell
gh run list -R ykwanghee-lab/yt-comment-dashboard --workflow android-build.yml -L 1
gh run watch <RUN_ID> -R ykwanghee-lab/yt-comment-dashboard
gh run download <RUN_ID> -R ykwanghee-lab/yt-comment-dashboard -D "$env:USERPROFILE\Desktop\suneung-map-aab"
```
- 결과물 폴더 이름에 `signed` 가 있어야 한다. `TEMPKEY` 면 비밀값이 안 들어간 것이니 3단계를 다시 확인한다.
- 실패하면 `gh run view <RUN_ID> --log-failed` 로 원인을 보고 고친 뒤 다시 푸시한다.

## 6. 사용자 사이트 저장소 (앱 전체화면용 신원 확인 파일)
TWA 앱이 주소창 없이 뜨려면 `https://ykwanghee-lab.github.io/.well-known/assetlinks.json` 이 도메인 루트에 있어야 한다.
```powershell
Set-Location $W
gh repo create ykwanghee-lab/ykwanghee-lab.github.io --public --clone
Set-Location ykwanghee-lab.github.io
New-Item -ItemType Directory -Force .well-known | Out-Null
Copy-Item ..\yt-comment-dashboard\suneung-map\web\.well-known\assetlinks.json .well-known\
New-Item -ItemType File -Force .nojekyll | Out-Null
```
`index.html` 은 앱으로 넘겨주는 한 줄짜리 페이지로 만든다:
`<meta http-equiv="refresh" content="0; url=/yt-comment-dashboard/suneung-map/web/">` 와 같은 주소의 링크 하나.
커밋 후 `git push -u origin main`. Pages가 꺼져 있으면:
```powershell
gh api -X POST repos/ykwanghee-lab/ykwanghee-lab.github.io/pages -f "source[branch]=main" -f "source[path]=/"
```
1~2분 뒤 `https://ykwanghee-lab.github.io/.well-known/assetlinks.json` 이 JSON으로 열리는지 확인한다.
(`.nojekyll` 이 없으면 점으로 시작하는 폴더가 배포에서 빠진다.)

## 7. 사용자에게 보고
쉬운 말로 짧게:
- 바탕화면 `suneung-map-aab` 폴더의 `.aab` 파일 위치
- 키 백업 폴더 위치와 백업 부탁
- 다음 할 일: Play Console → 테스트 및 출시 → 비공개 테스트 → 트랙 만들기 → `.aab` 업로드. 자세한 순서는 `suneung-map/store/play-console-답안지.md` 5장.

## 8. 나중에 할 일 (첫 업로드 이후)
Play Console → 테스트 및 출시 → 앱 무결성 → 앱 서명 에 나오는 **앱 서명 키 SHA-256** 을
두 assetlinks.json(사용자 사이트, `suneung-map/web/.well-known/`) 의 지문 목록에 **추가**한다. 업로드 키 지문은 그대로 둔다.
