# Android 앱 (TWA: Trusted Web Activity)

웹앱(`../web`)을 그대로 Android 앱으로 포장합니다. 코드 중복이 없고, 시험장 데이터는 앱 업데이트 없이 웹에서 바로 갱신됩니다.

## 사전 준비 (PC)
- Node.js 18+, JDK 17, Android SDK (Android Studio 설치로 충분)
- `npm i -g @bubblewrap/cli`
- 웹앱이 HTTPS로 배포되어 있어야 함 (GitHub Pages 권장). 배포 주소를 `twa-manifest.json`의 `YOUR-GITHUB-ID` 자리에 채우기

## 빌드
```bash
cd android
bubblewrap init --manifest https://<배포주소>/manifest.webmanifest   # 최초 1회, 질문에 답하면 twa-manifest.json 갱신 + keystore 생성
bubblewrap build                                                   # app-release-signed.apk, app-release-bundle.aab 생성
```
`app-release-bundle.aab` 를 Play Console 에 업로드합니다.

## Digital Asset Links (필수)
앱이 브라우저 주소창 없이 전체화면으로 뜨려면 웹 서버가 앱 서명을 신뢰한다고 선언해야 합니다.
1. `bubblewrap fingerprint list` 또는 Play Console > 앱 서명 > SHA-256 인증서 지문 확인
2. `../web/.well-known/assetlinks.json` 의 `SHA256_FINGERPRINT_HERE` 를 그 값으로 교체 후 배포
   (Play 앱 서명을 쓰면 업로드 키와 배포 키 지문 둘 다 넣는 것이 안전)

## Play Console 체크리스트
- 개발자 계정: 개인 계정은 테스터 12명 × 14일 비공개 테스트 후 프로덕션 신청 가능. 조직(사업자) 계정은 면제.
- 앱 콘텐츠: 개인정보처리방침 URL (수험번호 앞 4자리는 기기 내 처리, 위치는 거리 계산만, 서버 전송 없음), 데이터 보안 섹션 "수집 없음"
- 타깃 API 레벨은 bubblewrap 최신 버전이 자동으로 맞춤
- 스토어 등록정보: 스크린샷 4장 이상(홈, 찾기, 상세, 체크리스트), 512 아이콘, 1024×500 그래픽
- 심사 기간: 보통 1~7일. 11월 둘째 주 출시가 목표이면 10월 말까지 비공개 테스트 시작
