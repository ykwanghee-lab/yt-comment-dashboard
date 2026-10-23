# Android 앱 (TWA: Trusted Web Activity)

웹앱(`../web`)을 그대로 Android 앱으로 포장한 Gradle 프로젝트입니다. 코드 중복이 없고, 시험장 데이터는 앱 업데이트 없이 웹에서 바로 갱신됩니다.

## 빌드는 GitHub Actions 가 합니다 (PC 설치 불필요)
- main 브랜치에서 이 폴더나 워크플로 파일이 바뀌어 푸시되면 `.github/workflows/android-build.yml` 이 자동 실행됩니다. 저장소 → Actions 탭에서 수동 실행(Run workflow)도 됩니다.
- 결과물(AAB, APK)은 해당 실행의 "Artifacts" 에서 내려받습니다.
- 업로드 키는 `upload.jks.enc` 로 암호화되어 저장소에 있습니다(AES-256, PBKDF2). 저장소 Secrets 의 `UPLOAD_KEYSTORE_PASSWORD` 로 복호화해 서명합니다. 업로드 키 SHA-256: `64:E8:00:D1:D0:99:F6:1E:5B:7D:BD:D6:F5:06:AD:4D:EC:92:E5:DA:8E:E3:26:C6:CD:24:0D:FC:E6:48:7F:63` 없으면 임시 키로 빌드만 검증하며, 그 결과물 이름에 `TEMPKEY` 가 붙고 **Play 에 올리면 안 됩니다.**
- 업로드 키는 한 번 정하면 계속 같은 키를 써야 합니다 (Play 앱 서명 사용). 키스토어 파일과 비밀번호는 저장소에 절대 넣지 말고 따로 보관하세요.

## 버전
- versionCode = GitHub Actions 실행 번호(run_number), versionName = 1.0.<번호>. 매 빌드 자동 증가.

## 배포 주소를 바꿀 때
`app/build.gradle.kts` 의 `siteHost`/`sitePath`, `app/src/main/res/values/strings.xml` 의 `launch_url`/`web_manifest_url`/`asset_statements`, 그리고 `../web/.well-known/assetlinks.json` 을 함께 바꿉니다.

## Digital Asset Links (필수)
앱이 주소창 없이 전체화면으로 뜨려면 웹 서버가 앱 서명을 신뢰한다고 선언해야 합니다.
1. Play Console → 테스트 및 출시 → 앱 무결성 → 앱 서명 에서 **앱 서명 키 인증서의 SHA-256** 을 복사
2. `../web/.well-known/assetlinks.json` 의 `SHA256_FINGERPRINT_HERE` 를 그 값으로 교체 후 배포 (업로드 키 지문도 함께 넣어도 됨)

## Play Console 체크리스트
- 개인 계정: 테스터 12명 × 14일 비공개 테스트 후 프로덕션 신청 가능
- 앱 콘텐츠: 개인정보처리방침 URL(`../web/privacy.html` 배포 주소), 데이터 보안 "수집 없음", 광고 없음
- 등록정보 문구와 이미지: `../store/`

## Digital Asset Links 위치 주의
assetlinks.json 은 **도메인 루트**(`https://ykwanghee-lab.github.io/.well-known/assetlinks.json`)에 있어야 합니다.
프로젝트 페이지 하위 경로(`/yt-comment-dashboard/...`)에 있는 사본은 검증에 쓰이지 않습니다.
루트에 두려면 `ykwanghee-lab.github.io` 이름의 저장소(사용자 사이트)에 `.well-known/assetlinks.json` 과 `.nojekyll` 을 넣습니다.
