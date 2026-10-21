/* 수능시험장 찾기 - 단일 파일 앱 (프레임워크 없음)
 * 화면: #/ 홈, #/find 찾기, #/site/:id 시험장 상세, #/check 체크리스트
 * 원칙: 수험번호는 앞 4자리만, 기기 안에서만 조회. 서버 전송 없음.
 */
(() => {
  'use strict';
  const APP_ID = 'kr.suneungmap.app';            // 네이버지도 appname (Android applicationId 와 동일하게 유지)
  const DATA_URL = 'data/sites.json';
  const LS = { saved: 'sm.savedSite', cache: 'sm.dataCache', mode: 'sm.mode', checks: 'sm.checks', minutes: 'sm.minutes' };
  const $ = (s, el = document) => el.querySelector(s);
  const app = $('#app'), titleEl = $('#title'), backBtn = $('#back');
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);

  const state = {
    data: null,
    mode: localStorage.getItem(LS.mode) || 'public',
    region: '', district: '', query: '', nearby: null, pos: null,
  };

  /* ---------- 데이터 ---------- */
  async function loadData() {
    try {
      const res = await fetch(DATA_URL, { cache: 'no-cache' });
      if (!res.ok) throw new Error(res.status);
      state.data = await res.json();
      try { localStorage.setItem(LS.cache, JSON.stringify(state.data)); } catch (_) {}
    } catch (e) {
      try { state.data = JSON.parse(localStorage.getItem(LS.cache)); } catch (_) {}
      if (!state.data && window.__SITES__) state.data = window.__SITES__;
    }
  }
  const sites = () => (state.data && state.data.sites) || [];
  const siteById = (id) => sites().find((s) => s.id === id);
  const regionName = (code) => ((state.data.regions || []).find((r) => r.code === code) || {}).name || '';
  const districtName = (rc, dc) => {
    const r = (state.data.regions || []).find((x) => x.code === rc);
    return r ? ((r.districts.find((d) => d.code === dc) || {}).name || '') : '';
  };

  /* ---------- 유틸 ---------- */
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function kstToday() {
    const now = new Date();
    const kst = new Date(now.getTime() + (now.getTimezoneOffset() + 540) * 60000);
    return new Date(kst.getFullYear(), kst.getMonth(), kst.getDate());
  }
  function daysUntil(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    return Math.round((new Date(y, m - 1, d) - kstToday()) / 86400000);
  }
  const ddayText = (n) => (n > 0 ? `D-${n}` : n === 0 ? 'D-DAY' : `D+${-n}`);
  function fmtDate(ymd) {
    const [y, m, d] = ymd.split('-').map(Number);
    const w = '일월화수목금토'[new Date(y, m - 1, d).getDay()];
    return `${m}월 ${d}일(${w})`;
  }
  function distanceKm(a, b) {
    const R = 6371, toR = (x) => (x * Math.PI) / 180;
    const dLat = toR(b.lat - a.lat), dLng = toR(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a.lat)) * Math.cos(toR(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  let toastTimer;
  function toast(msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
  }
  const savedId = () => localStorage.getItem(LS.saved) || '';

  /* ---------- 지도앱 연동 ---------- */
  const MODES = { car: '자동차', public: '대중교통', walk: '도보' };
  function navTargets(site, mode) {
    const { lat, lng } = site, name = site.name, n = encodeURIComponent(name);
    const gmode = { car: 'driving', public: 'transit', walk: 'walking' }[mode];
    const web = { google: `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=${gmode}` };
    return {
      naver: {
        label: '네이버지도', cls: 'naver',
        scheme: `nmap://route/${mode}?dlat=${lat}&dlng=${lng}&dname=${n}&appname=${APP_ID}`,
        pkg: 'com.nhn.android.nmap', ios: 'https://apps.apple.com/kr/app/id311867728',
        web: `https://map.naver.com/p/search/${n}`,
      },
      kakao: {
        label: '카카오맵', cls: 'kakao',
        scheme: `kakaomap://route?ep=${lat},${lng}&by=${{ car: 'CAR', public: 'PUBLICTRANSIT', walk: 'FOOT' }[mode]}`,
        pkg: 'net.daum.android.map', ios: 'https://apps.apple.com/kr/app/id304608425',
        web: `https://map.kakao.com/link/to/${n},${lat},${lng}`,
      },
      tmap: {
        label: '티맵', cls: 'tmap', carOnly: true,
        scheme: `tmap://route?goalname=${n}&goalx=${lng}&goaly=${lat}`,
        pkg: 'com.skt.tmap.ku', ios: 'https://apps.apple.com/kr/app/id431589174',
        web: web.google,
      },
      basic: {
        label: isIOS ? 'Apple 지도' : '기본 지도앱', cls: '',
        scheme: isIOS
          ? `maps://?daddr=${lat},${lng}&dirflg=${{ car: 'd', public: 'r', walk: 'w' }[mode]}`
          : `geo:${lat},${lng}?q=${lat},${lng}(${n})`,
        pkg: '', ios: web.google, web: web.google,
      },
    };
  }
  function openNav(t) {
    if (isAndroid) {
      if (!t.pkg) { location.href = t.scheme; return; }
      // Android Chrome/TWA: intent:// 는 앱이 없으면 fallback 으로 자동 이동
      const [scheme, rest] = t.scheme.split('://');
      const fallback = encodeURIComponent(`market://details?id=${t.pkg}`);
      location.href = `intent://${rest}#Intent;scheme=${scheme};package=${t.pkg};S.browser_fallback_url=${fallback};end`;
      return;
    }
    const fallback = isIOS ? t.ios : t.web;
    const start = Date.now();
    const timer = setTimeout(() => { if (!document.hidden && Date.now() - start < 2500) location.href = fallback; }, 1600);
    document.addEventListener('visibilitychange', () => { if (document.hidden) clearTimeout(timer); }, { once: true });
    location.href = t.scheme;
  }

  /* ---------- 라우팅 ---------- */
  function route() {
    const h = location.hash.replace(/^#/, '') || '/';
    const m = h.match(/^\/site\/(\d{4})$/);
    if (m) return { name: 'site', id: m[1] };
    if (h.startsWith('/find')) return { name: 'find' };
    if (h.startsWith('/check')) return { name: 'check' };
    return { name: 'home' };
  }
  function render() {
    const r = route();
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.route === (r.name === 'site' ? 'find' : r.name)));
    backBtn.hidden = r.name === 'home';
    if (!state.data) { titleEl.textContent = '수능시험장 찾기'; app.innerHTML = `<div class="card"><p>시험장 데이터를 불러오지 못했습니다. 인터넷 연결을 확인한 뒤 다시 열어 주세요.</p><button class="btn primary" onclick="location.reload()">다시 시도</button></div>`; return; }
    ({ home, find, site, check })[r.name](r);
    window.scrollTo(0, 0);
  }
  backBtn.addEventListener('click', () => (history.length > 1 ? history.back() : (location.hash = '#/')));
  window.addEventListener('hashchange', render);

  /* ---------- 홈 ---------- */
  function statusBanner() {
    if (state.data.status === 'sample') {
      return `<div class="banner">⚠️ 지금은 <b>샘플 데이터</b>입니다. 각 시·도교육청이 시험장 명단을 발표(11월 초)하면 실제 명단으로 자동 반영됩니다.</div>`;
    }
    return `<div class="banner ok">✅ 교육청 발표 시험장 명단 반영 (업데이트 ${esc(state.data.updatedAt.slice(0, 10))})</div>`;
  }
  function home() {
    titleEl.textContent = '수능시험장 찾기';
    const d = state.data, dd = daysUntil(d.examDate), pd = daysUntil(d.preAssemblyDate);
    const saved = siteById(savedId());
    app.innerHTML = `
      <section class="hero">
        <div class="big">${ddayText(dd)}</div>
        <div class="sub">${esc(d.examYear)} 수능 · ${fmtDate(d.examDate)}</div>
        <div class="row"><span>예비소집 <b>${fmtDate(d.preAssemblyDate)}</b> ${pd >= 0 ? `(${ddayText(pd)})` : ''}</span><span>입실 완료 <b>${esc(d.entryDeadline)}</b></span></div>
      </section>
      ${statusBanner()}
      ${saved ? `<section class="card">
        <h2>내 시험장</h2>
        <a class="btn primary" href="#/site/${saved.id}">${esc(saved.name)} 길찾기 ›</a>
        <p class="muted small" style="margin:8px 0 0">${esc(saved.addr)}</p>
      </section>` : ''}
      <section class="card">
        <h2>수험번호로 내 시험장 찾기</h2>
        <p class="muted small" style="margin:0 0 10px">수험표의 수험번호 <b>앞 4자리</b>만 입력하세요. (앞 2자리 시험지구 + 다음 2자리 시험장) 입력값은 폰 밖으로 나가지 않습니다.</p>
        <form id="codeForm">
          <input class="code" id="code" inputmode="numeric" pattern="\\d{4}" maxlength="4" placeholder="0000" autocomplete="off" aria-label="수험번호 앞 4자리">
          <div class="err" id="codeErr" hidden></div>
          <button class="btn primary" type="submit" style="margin-top:12px">시험장 찾기</button>
        </form>
      </section>
      <section class="card">
        <h2>다른 방법으로 찾기</h2>
        <a class="btn" href="#/find">지역·학교 이름으로 찾기</a>
        <button class="btn" id="nearBtn">내 주변 시험장</button>
      </section>
      <section class="card">
        <h2>준비 체크리스트</h2>
        <a class="btn ghost" href="#/check">예비소집일·시험 당일 준비물 확인</a>
      </section>
      <p class="footer">데이터 버전 ${esc(d.version)} · 시험장 배정은 반드시 수험표로 최종 확인하세요.</p>`;
    const input = $('#code');
    setTimeout(() => { if (!saved) input.focus(); }, 50);
    input.addEventListener('input', () => { input.value = input.value.replace(/\D/g, '').slice(0, 4); if (input.value.length === 4) lookup(); });
    $('#codeForm').addEventListener('submit', (e) => { e.preventDefault(); lookup(); });
    function lookup() {
      const v = input.value; const err = $('#codeErr');
      if (v.length !== 4) { err.hidden = false; err.textContent = '숫자 4자리를 입력해 주세요.'; return; }
      const s = siteById(v);
      if (!s) {
        err.hidden = false;
        err.textContent = state.data.status === 'sample'
          ? '샘플 데이터에 없는 번호입니다. 교육청 명단 반영 후 다시 확인해 주세요. (샘플: 0101, 0201, 2101, 3101)'
          : '해당 번호의 시험장을 찾지 못했습니다. 수험표의 앞 4자리를 다시 확인해 주세요.';
        return;
      }
      location.hash = `#/site/${s.id}`;
    }
    $('#nearBtn').addEventListener('click', () => { state.nearby = true; location.hash = '#/find'; });
  }

  /* ---------- 찾기 ---------- */
  function find() {
    titleEl.textContent = '시험장 찾기';
    const regions = state.data.regions || [];
    const region = regions.find((r) => r.code === state.region);
    const districts = region ? region.districts : [];
    let list = sites().filter((s) => (!state.region || s.region === state.region) && (!state.district || s.district === state.district));
    const q = state.query.trim();
    if (q) list = list.filter((s) => s.name.includes(q) || s.addr.includes(q));
    if (state.nearby && state.pos) list = sites().map((s) => ({ ...s, km: distanceKm(state.pos, s) })).sort((a, b) => a.km - b.km).slice(0, 20);
    app.innerHTML = `
      ${statusBanner()}
      <section class="card">
        <div class="seg"><button data-tab="region" class="${state.nearby ? '' : 'on'}">지역으로 찾기</button><button data-tab="near" class="${state.nearby ? 'on' : ''}">내 주변</button></div>
        <div id="regionBox" ${state.nearby ? 'hidden' : ''}>
          <div class="grid2">
            <div class="field"><label>시·도</label><select id="region"><option value="">전체</option>${regions.map((r) => `<option value="${r.code}" ${r.code === state.region ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select></div>
            <div class="field"><label>시험지구</label><select id="district" ${region ? '' : 'disabled'}><option value="">전체</option>${districts.map((d) => `<option value="${d.code}" ${d.code === state.district ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
          </div>
          <div class="field"><label>학교 이름 검색</label><input id="q" type="search" placeholder="예: 경기고" value="${esc(state.query)}"></div>
        </div>
        <div id="nearBox" ${state.nearby ? '' : 'hidden'}>
          ${state.pos ? `<p class="muted small">현재 위치 기준 가까운 순 20곳</p>` : `<button class="btn primary" id="locBtn">현재 위치로 가까운 시험장 보기</button><p class="muted small" style="margin:8px 0 0">위치는 거리 계산에만 쓰이고 저장되지 않습니다.</p>`}
        </div>
      </section>
      <section class="card">
        <h2>${state.nearby && state.pos ? '가까운 시험장' : '시험장 목록'} <span class="muted small">${list.length}곳</span></h2>
        ${list.length ? `<ul class="list">${list.map((s) => `<li><a href="#/site/${s.id}"><div><div class="name">${esc(s.name)}</div><div class="addr">${esc(regionName(s.region))} · ${esc(districtName(s.region, s.district))} · ${esc(s.addr)}</div></div><span class="tag">${s.km != null ? s.km.toFixed(1) + 'km' : s.id}</span></a></li>`).join('')}</ul>`
          : `<p class="muted">조건에 맞는 시험장이 없습니다.</p>`}
      </section>`;
    document.querySelectorAll('.seg button').forEach((b) => b.addEventListener('click', () => { state.nearby = b.dataset.tab === 'near'; render(); }));
    $('#region').addEventListener('change', (e) => { state.region = e.target.value; state.district = ''; render(); });
    $('#district').addEventListener('change', (e) => { state.district = e.target.value; render(); });
    const qEl = $('#q'); qEl.addEventListener('input', () => { state.query = qEl.value; render(); const n = $('#q'); n.focus(); n.setSelectionRange(n.value.length, n.value.length); });
    const loc = $('#locBtn');
    if (loc) loc.addEventListener('click', () => {
      if (!navigator.geolocation) return toast('이 기기에서는 위치를 사용할 수 없습니다.');
      loc.disabled = true; loc.textContent = '위치 확인 중…';
      navigator.geolocation.getCurrentPosition(
        (p) => { state.pos = { lat: p.coords.latitude, lng: p.coords.longitude }; render(); },
        () => { toast('위치 권한이 필요합니다.'); render(); },
        { enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 });
    });
  }

  /* ---------- 시험장 상세 ---------- */
  function site({ id }) {
    const s = siteById(id);
    if (!s) { titleEl.textContent = '시험장'; app.innerHTML = `<div class="card"><p>시험장 정보를 찾지 못했습니다.</p><a class="btn" href="#/find">목록으로</a></div>`; return; }
    titleEl.textContent = s.name;
    const d = state.data, isSaved = savedId() === s.id;
    const minutes = Number(localStorage.getItem(LS.minutes) || 40);
    const bbox = `${s.lng - 0.006},${s.lat - 0.0035},${s.lng + 0.006},${s.lat + 0.0035}`;
    app.innerHTML = `
      <section class="card">
        <span class="chip">${esc(regionName(s.region))} · ${esc(districtName(s.region, s.district))} · 시험장 ${esc(s.siteNo)}</span>
        <div class="site-title">${esc(s.name)}</div>
        <div class="muted">${esc(s.addr)}</div>
        ${s.note === '샘플' ? `<div class="banner" style="margin-top:10px">샘플 항목입니다. 실제 배정과 다릅니다.</div>` : ''}
        ${navigator.onLine === false
          ? `<div class="map map-off">오프라인 상태입니다. 아래 길찾기 버튼은 지도앱이 설치되어 있으면 동작합니다.</div>`
          : `<iframe class="map" title="지도" loading="lazy" referrerpolicy="no-referrer" src="https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${s.lat},${s.lng}"></iframe>`}
        <div class="grid2" style="margin-top:12px">
          <button class="btn ${isSaved ? 'ghost' : ''}" id="saveBtn">${isSaved ? '✓ 내 시험장' : '내 시험장으로 저장'}</button>
          <button class="btn" id="shareBtn">가족에게 공유</button>
        </div>
      </section>
      <section class="card">
        <h2>길찾기</h2>
        <div class="seg" id="modeSeg">${Object.entries(MODES).map(([k, v]) => `<button data-mode="${k}" class="${state.mode === k ? 'on' : ''}">${v}</button>`).join('')}</div>
        <div id="navBtns"></div>
        <p class="muted small" style="margin:10px 0 0">앱이 설치되어 있지 않으면 스토어로 이동합니다. 시험 당일은 교통 통제와 혼잡을 감안해 평소보다 일찍 출발하세요.</p>
      </section>
      <section class="card">
        <h2>출발 시각 계산</h2>
        <p class="muted small" style="margin:0 0 10px">입실 완료 ${esc(d.entryDeadline)} 기준, 여유 20분을 뺀 출발 시각입니다.</p>
        <div class="calc"><span>소요시간</span><input id="minutes" type="number" inputmode="numeric" min="5" max="300" value="${minutes}"><span>분</span></div>
        <div class="result" id="departAt"></div>
        <button class="btn ghost" id="icsBtn" style="margin-top:12px">📅 캘린더에 예비소집·수능 일정 추가</button>
      </section>`;
    function renderNav() {
      const t = navTargets(s, state.mode);
      $('#navBtns').innerHTML = ['naver', 'kakao', 'tmap', 'basic'].map((k) => {
        const x = t[k]; const off = x.carOnly && state.mode !== 'car';
        return `<button class="btn ${x.cls}" data-app="${k}" ${off ? 'disabled' : ''}>${x.label}${off ? ' (자동차만)' : ''}</button>`;
      }).join('');
      document.querySelectorAll('#navBtns button').forEach((b) => b.addEventListener('click', () => openNav(t[b.dataset.app])));
    }
    renderNav();
    document.querySelectorAll('#modeSeg button').forEach((b) => b.addEventListener('click', () => {
      state.mode = b.dataset.mode; localStorage.setItem(LS.mode, state.mode);
      document.querySelectorAll('#modeSeg button').forEach((x) => x.classList.toggle('on', x === b)); renderNav();
    }));
    $('#saveBtn').addEventListener('click', () => {
      if (savedId() === s.id) { localStorage.removeItem(LS.saved); toast('저장을 해제했습니다.'); }
      else { localStorage.setItem(LS.saved, s.id); toast('내 시험장으로 저장했습니다.'); }
      render();
    });
    $('#shareBtn').addEventListener('click', async () => {
      const url = `${location.origin}${location.pathname}#/site/${s.id}`;
      const text = `[수능시험장] ${s.name}\n${s.addr}\n${url}`;
      if (navigator.share) { try { await navigator.share({ title: s.name, text, url }); } catch (_) {} }
      else { try { await navigator.clipboard.writeText(text); toast('링크를 복사했습니다.'); } catch (_) { prompt('복사해서 공유하세요', text); } }
    });
    const mEl = $('#minutes');
    function calc() {
      const m = Math.max(0, Number(mEl.value) || 0); localStorage.setItem(LS.minutes, String(m));
      const [hh, mm] = d.entryDeadline.split(':').map(Number);
      let t = hh * 60 + mm - 20 - m; if (t < 0) t = 0;
      $('#departAt').textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')} 출발`;
    }
    mEl.addEventListener('input', calc); calc();
    $('#icsBtn').addEventListener('click', () => downloadIcs(s));
  }
  function downloadIcs(s) {
    const d = state.data, ymd = (x) => x.replace(/-/g, '');
    const [hh, mm] = d.entryDeadline.split(':').map(Number);
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15) + 'Z';
    const ev = (uid, dt, summary, desc, alarmMin) => [
      'BEGIN:VEVENT', `UID:${uid}@suneung-map`, `DTSTAMP:${stamp}`, dt, `SUMMARY:${summary}`,
      `LOCATION:${s.name} ${s.addr}`, `DESCRIPTION:${desc}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', `TRIGGER:-PT${alarmMin}M`, `DESCRIPTION:${summary}`, 'END:VALARM', 'END:VEVENT'].join('\r\n');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//suneung-map//KO', 'CALSCALE:GREGORIAN',
      ev('pre', `DTSTART;VALUE=DATE:${ymd(d.preAssemblyDate)}`, `수능 예비소집 (수험표 수령) - ${s.name}`, '수험표 수령 후 이름·사진·선택과목 확인, 시험장 위치 확인', 720),
      ev('exam', `DTSTART;TZID=Asia/Seoul:${ymd(d.examDate)}T${String(hh).padStart(2, '0')}${String(mm).padStart(2, '0')}00`, `수능 시험 (입실 완료 ${d.entryDeadline}) - ${s.name}`, '수험표·신분증·컴퓨터용 사인펜 챙기기. 휴대전화 등 전자기기 반입 금지', 180),
      'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
    a.download = 'suneung.ics'; document.body.appendChild(a); a.click(); a.remove();
  }

  /* ---------- 체크리스트 ---------- */
  const CHECKS = [
    { title: '예비소집일 (수능 전날)', items: [
      '수험표 수령 후 이름·사진·선택과목·시험장 확인',
      '시험장 위치와 교통편 확인 (가능하면 직접 가 보기)',
      '시험장 안 시험실 배치표 확인',
      '수험생 유의사항(반입 금지 물품) 읽기',
      '준비물 가방에 미리 챙기기',
      '알람 2개 이상 맞추고 일찍 자기',
    ] },
    { title: '시험 당일 준비물', items: [
      '수험표', '신분증 (주민등록증·여권·학생증 등 시행 공고 기준)',
      '검은색 컴퓨터용 사인펜', '흰색 수정테이프', '흑색 연필·지우개',
      '아날로그 손목시계 (전자식·스마트워치 불가)', '도시락·물·간식',
      '겉옷 (시험실 온도 대비)', '입실 완료 시각까지 도착하도록 일찍 출발',
    ] },
  ];
  const BANNED = ['휴대전화', '스마트워치', '블루투스 이어폰', '디지털·전자식 시계', '전자담배', '태블릿', '전자사전', '카메라 펜', '통신·결제 기능 기기', 'MP3 플레이어'];
  function check() {
    titleEl.textContent = '준비 체크리스트';
    let done = {}; try { done = JSON.parse(localStorage.getItem(LS.checks) || '{}'); } catch (_) {}
    app.innerHTML = CHECKS.map((g, gi) => `<section class="card"><h2>${esc(g.title)}</h2>${g.items.map((it, i) => {
      const k = `${gi}-${i}`; return `<label class="check ${done[k] ? 'done' : ''}"><input type="checkbox" data-k="${k}" ${done[k] ? 'checked' : ''}><span>${esc(it)}</span></label>`;
    }).join('')}</section>`).join('') + `
      <section class="card"><h2>시험장 반입 금지 물품</h2><div class="ban">${BANNED.map((b) => `<span>${esc(b)}</span>`).join('')}</div>
      <p class="muted small" style="margin:10px 0 0">부득이 가져온 경우 1교시 시작 전 감독관에게 제출하세요. 최종 기준은 교육부·평가원 수험생 유의사항을 따릅니다.</p></section>
      <button class="btn ghost" id="resetChecks">체크 초기화</button>`;
    document.querySelectorAll('.check input').forEach((c) => c.addEventListener('change', () => {
      done[c.dataset.k] = c.checked; localStorage.setItem(LS.checks, JSON.stringify(done)); c.closest('.check').classList.toggle('done', c.checked);
    }));
    $('#resetChecks').addEventListener('click', () => { localStorage.removeItem(LS.checks); render(); });
  }

  /* ---------- 시작 ---------- */
  (async () => {
    await loadData();
    render();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
  })();
})();
